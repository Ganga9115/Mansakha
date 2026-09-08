const express = require('express');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { supabase } = require('../../core/db/supabaseClient');
const { pool, withTransaction } = require('../../core/db/pgPool');
const { writeAuditLog } = require('../../core/services/auditLog');
const { verifyToken } = require('../../core/middleware/verifyToken');
const { requireRole } = require('../../core/middleware/requireRole');
const { generalApiLimiter } = require('../../core/middleware/rateLimiter');
const { ok, fail } = require('../../core/services/responseEnvelope');
const { getDescendantJurisdictionIds } = require('../../core/services/jurisdictionTree');
const { renderReportHtml, generatePdfBuffer } = require('../../core/services/reportPdf');

const router = express.Router();

router.use(verifyToken, requireRole(['Ministry']), generalApiLimiter);

const CREATABLE_ROLES = ['Administration', 'Counsellor', 'Data Operator',
  'District Welfare Officer', 'Investigating Officer', 'Protection Officer',
  'DLSA Coordinator', 'Special Public Prosecutor', 'District Collector', 'Rehabilitation Officer'];
const JURISDICTION_LIMITED_LEVELS = ['district', 'state']; // Feature Catalog Section 6.2: "Limit: 1 per District/State"

// Section 6.2's new validation - an Administration account at district or
// state level can't be created (or granted) where an active one already
// exists for that exact jurisdiction. National Administration and Counsellor
// have no stated limit; Data Operator isn't jurisdiction-scoped at all.
async function checkJurisdictionLimit(roleName, jurisdictionId) {
  if (roleName !== 'Administration' || !jurisdictionId) return null;

  // Raw pg, not Supabase REST - this read-only check runs on every account
  // creation/role-grant call, no reason to pay PostgREST's ~500-650ms round
  // trip for it.
  const { rows: levelRows } = await pool.query('select level from jurisdictions where jurisdiction_id = $1', [jurisdictionId]);
  const level = levelRows[0];
  if (!level || !JURISDICTION_LIMITED_LEVELS.includes(level.level)) return null;

  // Raw pg join, not Supabase REST's embed syntax - official_roles ->
  // roles is unambiguous (unlike official_roles -> officials elsewhere in
  // this file), so a plain join works directly.
  const { rows: existing } = await pool.query(
    `select orl.official_role_id, r.role_name
     from official_roles orl
     join roles r on r.role_id = orl.role_id
     where orl.jurisdiction_id = $1 and orl.revoked_at is null`,
    [jurisdictionId]
  );

  const alreadyHasAdmin = (existing || []).some((r) => r.role_name === 'Administration');
  if (alreadyHasAdmin) return `This ${level.level} already has an active Administration account - delete it (via Edit) before assigning a new one`;
  return null;
}

// The Staff Management screen (Section 8) needs to list existing accounts before
// it can show anything to create/revoke - the create/revoke routes alone don't
// support that.
// role/level filter accepted so the Staff Management UI can show one category
// at a time (National/State/District Admin, Counsellor, Data Operator)
// instead of one flat 770+-row list - level only means something for
// role=Administration (National/State/District Admin are all that one role,
// distinguished only by their jurisdiction's level). Written as raw SQL
// (not supabase-js) because filtering the parent row by a condition on a
// doubly-nested embed (official_roles -> jurisdictions.level) isn't
// something PostgREST's embed syntax can express.
router.get('/staff', async (req, res) => {
  const { role, level } = req.query;
  const pageSize = 30;
  // A non-numeric/zero/negative page (bad client state, manual query tinkering)
  // would otherwise turn into `limit 30 offset NaN` / a negative offset below -
  // Postgres throws a raw syntax/range error instead of a clean 400.
  const page = Math.max(1, Number(req.query.page) || 1);
  const offset = (page - 1) * pageSize;

  const conditions = ['orl.revoked_at is null'];
  const params = [];
  if (role) {
    params.push(role);
    conditions.push(`r.role_name = $${params.length}`);
  }
  if (level) {
    params.push(level);
    conditions.push(`j.level = $${params.length}`);
  }
  const whereClause = conditions.join(' and ');

  try {
    // Count and page are independent of each other - run concurrently
    // instead of one waiting on the other.
    const [{ rows: countRows }, { rows }] = await Promise.all([
      pool.query(
        `select count(*) from officials o
         join official_roles orl on orl.official_id = o.official_id
         join roles r on r.role_id = orl.role_id
         left join jurisdictions j on j.jurisdiction_id = orl.jurisdiction_id
         where ${whereClause}`,
        params
      ),
      pool.query(
        `select o.official_id, o.full_name, o.email, o.phone, o.whatsapp_number, o.staff_id, o.must_change_password,
                r.role_name, j.name as jurisdiction_name
         from officials o
         join official_roles orl on orl.official_id = o.official_id
         join roles r on r.role_id = orl.role_id
         left join jurisdictions j on j.jurisdiction_id = orl.jurisdiction_id
         where ${whereClause}
         order by o.full_name
         limit ${pageSize} offset ${offset}`,
        params
      ),
    ]);

    const staff = rows.map((o) => ({
      officialId: o.official_id,
      fullName: o.full_name,
      email: o.email,
      phone: o.phone,
      whatsappNumber: o.whatsapp_number,
      staffId: o.staff_id,
      mustChangePassword: o.must_change_password,
      roleName: o.role_name,
      jurisdictionName: o.jurisdiction_name,
      status: 'active', // the join above only matches unrevoked role rows
    }));

    return ok(res, { staff, total: Number(countRows[0].count), page: Number(page), pageSize });
  } catch (err) {
    return fail(res, `Could not load staff list: ${err.message}`, 500);
  }
});

// Ministry-wide user list for Super Admin visibility (Feature Catalog
// Section 3/8's oversight remit) - every user regardless of who
// provisioned them (District Admin or Data Operator), unlike Data Operator's
// own /api/dataoperator/users which only shows its own auth_method. Read-only
// here; editing/deleting a user record stays on the Data Operator screen
// that already owns that flow.
router.get('/users', async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = 30;
  const offset = (page - 1) * pageSize;

  const { rows } = await pool.query(
    // ui joined via coalesce(u.linked_to_user_id, u.user_id) - a dependent
    // case (Multi-Case-Per-Person Support) has no user_identity row of its
    // own (it inherits the anchor's - see createLinkedCase in
    // userProvisioning.js), so joining on u.user_id directly would show a
    // blank name/contact/address for one even though the real person's
    // identity is known via their other case.
    `select u.user_id, u.docket_number, u.case_stage, u.status, u.auth_method, u.enrolled_at,
            ct.name as case_type_name, j.name as jurisdiction_name,
            ui.full_name, ui.contact_number, ui.address,
            count(*) over() as total_count
     from users u
     left join case_types ct on ct.case_type_id = u.case_type_id
     left join jurisdictions j on j.jurisdiction_id = u.jurisdiction_id
     left join user_identity ui on ui.user_id = coalesce(u.linked_to_user_id, u.user_id)
     order by u.enrolled_at desc
     limit $1 offset $2`,
    [pageSize, offset]
  );

  const users = rows.map((u) => ({
    userId: u.user_id,
    docketNumber: u.docket_number,
    fullName: u.full_name || null,
    contactNumber: u.contact_number || null,
    address: u.address || null,
    caseType: u.case_type_name || null,
    jurisdictionName: u.jurisdiction_name || null,
    caseStage: u.case_stage,
    status: u.status,
    provisionedVia: u.auth_method === 'district_admin' ? 'District Admin' : 'Data Operator',
    enrolledAt: u.enrolled_at,
  }));

  return ok(res, { users, total: rows.length > 0 ? Number(rows[0].total_count) : 0, page: Number(page), pageSize });
});

// Extends Section 7's contract (explicitly allowed: "extend as needed, keep the
// shape consistent") with what Section 3/8 requires for Ministry to function at
// all: nothing else can onboard staff without this.
router.post('/staff', async (req, res) => {
  const { fullName, email, roleName, jurisdictionId, providerId, password, staffId, phone, whatsappNumber } = req.body;
  if (!fullName || !email || !roleName || !password) return fail(res, 'fullName, email, roleName, and password are required', 400);

  // Server-side allowlist, not trusting client input: this endpoint can ONLY create
  // Administration/Counsellor/Data Operator accounts. A Ministry account is
  // seeded/manually provisioned (Section 3) and must never be creatable through
  // an API call, even if a client sent roleName: "Ministry".
  if (!CREATABLE_ROLES.includes(roleName)) {
    return fail(res, `roleName must be one of: ${CREATABLE_ROLES.join(', ')}`, 400);
  }
  if (roleName === 'Administration' && !jurisdictionId) {
    return fail(res, 'jurisdictionId is required for Administration accounts', 400);
  }
  // Required for Counsellor accounts specifically because the Call
  // Counsellor/WhatsApp redirect a user can trigger (user/routes/user.routes.js)
  // needs a real number to send them to - NOT a login credential; staff
  // login is email + password only (core/routes/auth.staff.routes.js).
  if (roleName === 'Counsellor' && !phone) {
    return fail(res, 'phone is required for Counsellor accounts (used for the Call/WhatsApp contact feature)', 400);
  }
  // migration_031 - a Rehabilitation Officer account is scoped to exactly
  // one centre (mirrors Administration's jurisdictionId requirement above),
  // otherwise its queue is empty by design (see rehabilitationOfficer.routes.js).
  if (roleName === 'Rehabilitation Officer' && !providerId) {
    return fail(res, 'providerId is required for Rehabilitation Officer accounts', 400);
  }

  const limitError = await checkJurisdictionLimit(roleName, jurisdictionId);
  if (limitError) return fail(res, limitError, 409);

  // Raw pg, not Supabase REST - single-row lookup by name, no reason to pay
  // PostgREST's round trip on every account creation.
  const { rows: roleRows } = await pool.query('select role_id from roles where role_name = $1', [roleName]);
  const roleRow = roleRows[0];

  const passwordHash = await bcrypt.hash(password, 12);

  // officials + official_roles in one transaction - an official row must never
  // exist without a role assignment (that would be an account that can log in
  // but has no permissions at all, previously possible if the second insert
  // failed silently after the first succeeded).
  let officialId;
  try {
    officialId = await withTransaction(async (client) => {
      const { rows } = await client.query(
        // staffId: the login screen's "State Admin ID"/"Counsellor ID"/etc. field -
        // defaults to '1' (every account uses that placeholder for now, per explicit
        // request) when Ministry doesn't send one. whatsappNumber: distinct from
        // phone - a Counsellor's "opt for manual counselling -> WhatsApp" redirect
        // target (user/routes/user.routes.js's /assigned-counsellor).
        `insert into officials (full_name, email, password_hash, must_change_password, staff_id, phone, whatsapp_number, provisioned_by)
         values ($1, $2, $3, true, $4, $5, $6, $7)
         returning official_id`,
        [fullName, email, passwordHash, staffId || '1', phone || null, whatsappNumber || null, req.auth.officialId]
      );
      const id = rows[0].official_id;
      await client.query(
        `insert into official_roles (official_id, role_id, jurisdiction_id, provider_id, assigned_by) values ($1, $2, $3, $4, $5)`,
        [
          id,
          roleRow.role_id,
          roleName === 'Administration' ? jurisdictionId : jurisdictionId || null,
          roleName === 'Rehabilitation Officer' ? providerId : providerId || null,
          req.auth.officialId,
        ]
      );
      return id;
    });
  } catch (err) {
    return fail(res, `Could not create account: ${err.message}`, 500);
  }

  await writeAuditLog({ officialId: req.auth.officialId, action: 'create', entityType: 'official', entityId: officialId });

  // must_change_password forces them to replace it on first login.
  return ok(res, { officialId }, 'Account created', 201);
});

// Deliberately no email here - it's the login identifier, and an edit could
// accidentally lock the account out. newPassword is optional (Ministry
// resetting someone's forgotten/compromised password) - when sent, it always
// forces must_change_password back to true, same as a brand-new account, so
// Ministry never learns the account's real ongoing password.
router.patch('/staff/:officialId', async (req, res) => {
  const { officialId } = req.params;
  const { fullName, phone, whatsappNumber, staffId, newPassword } = req.body;
  if (!fullName && phone === undefined && whatsappNumber === undefined && !staffId && !newPassword) {
    return fail(res, 'fullName, phone, whatsappNumber, staffId, or newPassword is required', 400);
  }
  if (newPassword && newPassword.length < 8) return fail(res, 'newPassword must be at least 8 characters', 400);

  // Clearing phone on an active Counsellor would break the Call
  // Counsellor/WhatsApp redirect a user can trigger (user/routes/user.routes.js)
  // - block it rather than let an edit silently strand that feature. Not a
  // login credential; staff login is email + password only
  // (core/routes/auth.staff.routes.js).
  if (phone === '' || phone === null) {
    // Raw pg join, not Supabase REST's embed syntax - same unambiguous
    // official_roles -> roles join as checkJurisdictionLimit above.
    const { rows: roleRows } = await pool.query(
      `select r.role_name from official_roles orl
       join roles r on r.role_id = orl.role_id
       where orl.official_id = $1 and orl.revoked_at is null`,
      [officialId]
    );
    const isCounsellor = (roleRows || []).some((r) => r.role_name === 'Counsellor');
    if (isCounsellor) return fail(res, 'phone cannot be cleared for a Counsellor account - it is required for the Call/WhatsApp contact feature', 400);
  }

  const patch = {};
  if (fullName) patch.full_name = fullName;
  if (phone !== undefined) patch.phone = phone || null;
  if (whatsappNumber !== undefined) patch.whatsapp_number = whatsappNumber || null;
  if (staffId) patch.staff_id = staffId;
  if (newPassword) {
    patch.password_hash = await bcrypt.hash(newPassword, 12);
    patch.must_change_password = true;
    // Without this, a session token issued before this reset stayed fully
    // valid indefinitely afterward - tokens carry no `exp` and verifyToken
    // had no way to know the password (the whole point of this "reset a
    // compromised password" action) had changed underneath it.
    patch.password_changed_at = new Date().toISOString();
  }

  const { error } = await supabase.from('officials').update(patch).eq('official_id', officialId);
  if (error) return fail(res, `Could not update account: ${error.message}`, 500);

  await writeAuditLog({ officialId: req.auth.officialId, action: 'update', entityType: 'official', entityId: officialId });

  return ok(res, null, 'Account updated');
});

// Every table with an official_id-shaped foreign key into officials (besides
// official_roles, which is this account's own role grant and gets deleted
// alongside it, not treated as "history"). Checked up front by the delete
// route below, same reasoning/pattern as userProvisioning.js's deleteUser.
const OFFICIAL_HISTORY_TABLES = [
  ['official_roles', 'assigned_by'], // assigned someone ELSE a role
  ['officials', 'provisioned_by'], // provisioned someone ELSE's account
  ['interventions', 'assigned_official_id'],
  ['case_notes', 'official_id'],
  ['dispatch_queue', 'official_id'],
  ['messages', 'official_id'],
  ['counselling_sessions', 'counsellor_id'],
  ['sos_events', 'resolved_by'],
  ['alert_notifications', 'official_id'],
  ['audit_log', 'official_id'],
  ['reports', 'generated_by'],
];

// Hard delete - only actually succeeds for an account with no activity yet
// (a freshly created/seeded account that has never logged in or acted). An
// account with real history can't be cleanly removed without orphaning what
// it created/touched, so it throws a clear error instead.
router.delete('/staff/:officialId', async (req, res) => {
  const { officialId } = req.params;
  try {
    await withTransaction(async (client) => {
      for (const [table, column] of OFFICIAL_HISTORY_TABLES) {
        const { rows } = await client.query(`select 1 from ${table} where ${column} = $1 limit 1`, [officialId]);
        if (rows.length) {
          const err = new Error('This account has activity history and cannot be deleted.');
          err.status = 409;
          throw err;
        }
      }

      await client.query('delete from official_roles where official_id = $1', [officialId]);
      const { rowCount } = await client.query('delete from officials where official_id = $1', [officialId]);
      if (!rowCount) {
        const err = new Error('Account not found');
        err.status = 404;
        throw err;
      }
    });
  } catch (err) {
    return fail(res, err.message || 'Could not delete account', err.status || 409);
  }

  await writeAuditLog({ officialId: req.auth.officialId, action: 'delete', entityType: 'official', entityId: officialId });

  return ok(res, null, 'Account deleted');
});

// (Re)grants a role/jurisdiction to an existing official - e.g. after a
// revoke, or adding a second role to someone who already has one. Reuses the
// same allowlist/validation as account creation.
router.post('/staff/:officialId/roles', async (req, res) => {
  const { officialId } = req.params;
  const { roleName, jurisdictionId, providerId } = req.body;
  if (!roleName) return fail(res, 'roleName is required', 400);
  if (!CREATABLE_ROLES.includes(roleName)) return fail(res, `roleName must be one of: ${CREATABLE_ROLES.join(', ')}`, 400);
  if (roleName === 'Administration' && !jurisdictionId) return fail(res, 'jurisdictionId is required for Administration accounts', 400);
  if (roleName === 'Rehabilitation Officer' && !providerId) return fail(res, 'providerId is required for Rehabilitation Officer accounts', 400);

  const limitError = await checkJurisdictionLimit(roleName, jurisdictionId);
  if (limitError) return fail(res, limitError, 409);

  // Raw pg, not Supabase REST - both single-row lookups below run on every
  // role-grant call.
  const { rows: officialRows } = await pool.query('select official_id from officials where official_id = $1', [officialId]);
  const official = officialRows[0];
  if (!official) return fail(res, 'Account not found', 404);

  const { rows: roleRowsForGrant } = await pool.query('select role_id from roles where role_name = $1', [roleName]);
  const roleRow = roleRowsForGrant[0];

  const { data, error } = await supabase
    .from('official_roles')
    .insert({
      official_id: officialId,
      role_id: roleRow.role_id,
      jurisdiction_id: jurisdictionId || null,
      provider_id: providerId || null,
      assigned_by: req.auth.officialId,
    })
    .select('official_role_id')
    .single();
  if (error) return fail(res, `Could not assign role: ${error.message}`, 500);

  await writeAuditLog({ officialId: req.auth.officialId, action: 'create', entityType: 'official_role', entityId: data.official_role_id });

  return ok(res, { officialRoleId: data.official_role_id }, 'Role assigned', 201);
});

// Not a hard delete: `officials` has live FK references (interventions,
// audit_log, official_roles.assigned_by) that a DELETE would break. This
// revokes every active role the account holds - combined with verifyToken's
// per-request DB recheck, a zero-role account is already fully locked out,
// which is what "delete/deactivate" actually needs to mean here.
router.patch('/staff/:officialId/revoke', async (req, res) => {
  const { officialId } = req.params;

  const { error } = await supabase
    .from('official_roles')
    .update({ revoked_at: new Date().toISOString() })
    .eq('official_id', officialId)
    .is('revoked_at', null);
  if (error) return fail(res, 'Could not revoke account', 500);

  await writeAuditLog({ officialId: req.auth.officialId, action: 'revoke', entityType: 'official', entityId: officialId });

  return ok(res, null, 'Account access revoked');
});

router.get('/audit-log', async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = 50;
  const offset = (page - 1) * pageSize;

  // AuditLog.jsx reads auditId/createdAt/officialName/entityType/entityId -
  // this route used to pass the raw snake_case row straight through with no
  // officials join, so every field it actually reads was undefined (only
  // `action` coincidentally matched): timestamps rendered "Invalid Date",
  // official always fell back to "System", and Entity was always blank.
  const { rows } = await pool.query(
    `select al.log_id, al.official_id, o.full_name as official_name, al.user_id, al.action,
            al.entity_type, al.entity_id, al.occurred_at, count(*) over() as total_count
     from audit_log al
     left join officials o on o.official_id = al.official_id
     order by al.occurred_at desc
     limit $1 offset $2`,
    [pageSize, offset]
  );

  return ok(res, {
    entries: rows.map((r) => ({
      auditId: r.log_id,
      officialId: r.official_id,
      officialName: r.official_name || null,
      userId: r.user_id,
      action: r.action,
      entityType: r.entity_type,
      entityId: r.entity_id,
      createdAt: r.occurred_at,
    })),
    total: rows.length > 0 ? Number(rows[0].total_count) : 0,
  });
});

// Raw pg, not Supabase REST, for this whole GET/POST/PATCH/DELETE lookup-table
// group (languages/case-types/intervention-types/channels below) - each of
// these was paying a full ~500-650ms PostgREST round trip per call, and the
// GET routes especially are dropdown data loaded on many admin screens.
// Single-table, single-row-by-id writes throughout, so the conversion is a
// direct 1:1 translation with no chaining/transaction concerns.
router.get('/languages', async (req, res) => {
  try {
    const { rows } = await pool.query('select language_id, code, name from languages where deleted_at is null order by name');
    return ok(res, { languages: rows });
  } catch (err) {
    return fail(res, 'Could not load languages', 500);
  }
});

router.post('/languages', async (req, res) => {
  const { code, name } = req.body;
  if (!code || !name) return fail(res, 'code and name are required', 400);

  let languageId;
  try {
    const { rows } = await pool.query('insert into languages (code, name) values ($1, $2) returning language_id', [code, name]);
    languageId = rows[0].language_id;
  } catch (err) {
    return fail(res, `Could not add language: ${err.message}`, 500);
  }

  await writeAuditLog({ officialId: req.auth.officialId, action: 'create', entityType: 'language', entityId: languageId });

  return ok(res, { languageId }, 'Language added', 201);
});

router.patch('/languages/:languageId', async (req, res) => {
  const { languageId } = req.params;
  const { code, name } = req.body;
  if (!code && !name) return fail(res, 'code or name is required', 400);

  try {
    if (code && name) {
      await pool.query('update languages set code = $1, name = $2 where language_id = $3', [code, name, languageId]);
    } else if (code) {
      await pool.query('update languages set code = $1 where language_id = $2', [code, languageId]);
    } else {
      await pool.query('update languages set name = $1 where language_id = $2', [name, languageId]);
    }
  } catch (err) {
    return fail(res, `Could not update language: ${err.message}`, 500);
  }

  await writeAuditLog({ officialId: req.auth.officialId, action: 'update', entityType: 'language', entityId: languageId });

  return ok(res, null, 'Language updated');
});

// Soft-delete - users.preferred_language FKs into this table, so a
// language a user already picked must keep resolving even after it's
// removed from the selectable list.
router.delete('/languages/:languageId', async (req, res) => {
  const { languageId } = req.params;

  try {
    await pool.query('update languages set deleted_at = $1 where language_id = $2', [new Date().toISOString(), languageId]);
  } catch (err) {
    return fail(res, `Could not remove language: ${err.message}`, 500);
  }

  await writeAuditLog({ officialId: req.auth.officialId, action: 'delete', entityType: 'language', entityId: languageId });

  return ok(res, null, 'Language removed');
});

// ===== Feature Catalog Section 6.4 - "Manage case types" / "Manage
// intervention types" / "Manage channels", the same GET/POST/PATCH/DELETE
// soft-delete pattern as languages above (each written out explicitly,
// matching this codebase's existing style rather than a generic CRUD
// factory - languages itself is written the same longhand way). users.
// case_type_id / distress_scores.suggested_intervention_type_id /
// interactions.channel_id all FK into these, so removal is soft-delete only,
// same reasoning as languages. =====

router.get('/case-types', async (req, res) => {
  try {
    const { rows } = await pool.query('select case_type_id, name from case_types where deleted_at is null order by name');
    return ok(res, { caseTypes: rows });
  } catch (err) {
    return fail(res, 'Could not load case types', 500);
  }
});

router.post('/case-types', async (req, res) => {
  const { name } = req.body;
  if (!name) return fail(res, 'name is required', 400);

  let caseTypeId;
  try {
    const { rows } = await pool.query('insert into case_types (name) values ($1) returning case_type_id', [name]);
    caseTypeId = rows[0].case_type_id;
  } catch (err) {
    return fail(res, `Could not add case type: ${err.message}`, 500);
  }

  await writeAuditLog({ officialId: req.auth.officialId, action: 'create', entityType: 'case_type', entityId: caseTypeId });
  return ok(res, { caseTypeId }, 'Case type added', 201);
});

router.patch('/case-types/:caseTypeId', async (req, res) => {
  const { caseTypeId } = req.params;
  const { name } = req.body;
  if (!name) return fail(res, 'name is required', 400);

  try {
    await pool.query('update case_types set name = $1 where case_type_id = $2', [name, caseTypeId]);
  } catch (err) {
    return fail(res, `Could not update case type: ${err.message}`, 500);
  }

  await writeAuditLog({ officialId: req.auth.officialId, action: 'update', entityType: 'case_type', entityId: caseTypeId });
  return ok(res, null, 'Case type updated');
});

router.delete('/case-types/:caseTypeId', async (req, res) => {
  const { caseTypeId } = req.params;

  try {
    await pool.query('update case_types set deleted_at = $1 where case_type_id = $2', [new Date().toISOString(), caseTypeId]);
  } catch (err) {
    return fail(res, `Could not remove case type: ${err.message}`, 500);
  }

  await writeAuditLog({ officialId: req.auth.officialId, action: 'delete', entityType: 'case_type', entityId: caseTypeId });
  return ok(res, null, 'Case type removed');
});

router.get('/intervention-types', async (req, res) => {
  try {
    const { rows } = await pool.query('select intervention_type_id, name from intervention_types where deleted_at is null order by name');
    return ok(res, { interventionTypes: rows });
  } catch (err) {
    return fail(res, 'Could not load intervention types', 500);
  }
});

router.post('/intervention-types', async (req, res) => {
  const { name } = req.body;
  if (!name) return fail(res, 'name is required', 400);

  let interventionTypeId;
  try {
    const { rows } = await pool.query('insert into intervention_types (name) values ($1) returning intervention_type_id', [name]);
    interventionTypeId = rows[0].intervention_type_id;
  } catch (err) {
    return fail(res, `Could not add intervention type: ${err.message}`, 500);
  }

  await writeAuditLog({ officialId: req.auth.officialId, action: 'create', entityType: 'intervention_type', entityId: interventionTypeId });
  return ok(res, { interventionTypeId }, 'Intervention type added', 201);
});

router.patch('/intervention-types/:interventionTypeId', async (req, res) => {
  const { interventionTypeId } = req.params;
  const { name } = req.body;
  if (!name) return fail(res, 'name is required', 400);

  try {
    await pool.query('update intervention_types set name = $1 where intervention_type_id = $2', [name, interventionTypeId]);
  } catch (err) {
    return fail(res, `Could not update intervention type: ${err.message}`, 500);
  }

  await writeAuditLog({ officialId: req.auth.officialId, action: 'update', entityType: 'intervention_type', entityId: interventionTypeId });
  return ok(res, null, 'Intervention type updated');
});

router.delete('/intervention-types/:interventionTypeId', async (req, res) => {
  const { interventionTypeId } = req.params;

  try {
    await pool.query('update intervention_types set deleted_at = $1 where intervention_type_id = $2', [new Date().toISOString(), interventionTypeId]);
  } catch (err) {
    return fail(res, `Could not remove intervention type: ${err.message}`, 500);
  }

  await writeAuditLog({ officialId: req.auth.officialId, action: 'delete', entityType: 'intervention_type', entityId: interventionTypeId });
  return ok(res, null, 'Intervention type removed');
});

router.get('/channels', async (req, res) => {
  try {
    const { rows } = await pool.query('select channel_id, channel_name from channels where deleted_at is null order by channel_name');
    return ok(res, { channels: rows });
  } catch (err) {
    return fail(res, 'Could not load channels', 500);
  }
});

router.post('/channels', async (req, res) => {
  const { channelName } = req.body;
  if (!channelName) return fail(res, 'channelName is required', 400);

  let channelId;
  try {
    const { rows } = await pool.query('insert into channels (channel_name) values ($1) returning channel_id', [channelName]);
    channelId = rows[0].channel_id;
  } catch (err) {
    return fail(res, `Could not add channel: ${err.message}`, 500);
  }

  await writeAuditLog({ officialId: req.auth.officialId, action: 'create', entityType: 'channel', entityId: channelId });
  return ok(res, { channelId }, 'Channel added', 201);
});

router.patch('/channels/:channelId', async (req, res) => {
  const { channelId } = req.params;
  const { channelName } = req.body;
  if (!channelName) return fail(res, 'channelName is required', 400);

  try {
    await pool.query('update channels set channel_name = $1 where channel_id = $2', [channelName, channelId]);
  } catch (err) {
    return fail(res, `Could not update channel: ${err.message}`, 500);
  }

  await writeAuditLog({ officialId: req.auth.officialId, action: 'update', entityType: 'channel', entityId: channelId });
  return ok(res, null, 'Channel updated');
});

router.delete('/channels/:channelId', async (req, res) => {
  const { channelId } = req.params;

  try {
    await pool.query('update channels set deleted_at = $1 where channel_id = $2', [new Date().toISOString(), channelId]);
  } catch (err) {
    return fail(res, `Could not remove channel: ${err.message}`, 500);
  }

  await writeAuditLog({ officialId: req.auth.officialId, action: 'delete', entityType: 'channel', entityId: channelId });
  return ok(res, null, 'Channel removed');
});

// ===== Feature Catalog Section 6.3 =====

// "Heatmaps by state / region" - pure aggregation, no new table. One row per
// state: user count + average of each user's most recent distress score.
router.get('/heatmap', async (req, res) => {
  // One grouped query for every state at once (group by each district's
  // parent_id) instead of one round trip per state - the ~35 separate pg
  // queries this used to run were still the dominant cost even after moving
  // off Supabase REST, all competing for the same 10-connection pool. Same
  // fix as districtAdmin.routes.js's countUsersByRiskGroupedByChild, just also carrying
  // the average score this page needs that the dashboard route doesn't.
  const [{ rows: states }, { rows: grouped }] = await Promise.all([
    pool.query(`select jurisdiction_id, name from jurisdictions where level = 'state'`),
    pool.query(
      `select j.parent_id as state_id,
              count(distinct u.user_id) as user_count,
              avg(ds.score_value) as avg_score,
              count(distinct u.user_id) filter (where rl.name = 'Moderate') as vulnerable,
              count(distinct u.user_id) filter (where rl.name = 'High') as high_risk,
              count(distinct u.user_id) filter (where rl.name = 'Critical') as critical
       from users u
       join jurisdictions j on j.jurisdiction_id = u.jurisdiction_id
       left join lateral (
         select score_value, risk_level_id from distress_scores where user_id = u.user_id order by computed_at desc limit 1
       ) ds on true
       left join risk_levels rl on rl.risk_level_id = ds.risk_level_id
       group by j.parent_id`
    ),
  ]);

  const byStateId = new Map(grouped.map((r) => [r.state_id, r]));

  const heatmap = states.map((state) => {
    const g = byStateId.get(state.jurisdiction_id);
    return {
      jurisdictionId: state.jurisdiction_id,
      name: state.name,
      userCount: g ? Number(g.user_count) : 0,
      averageScore: g && g.avg_score !== null ? Math.round(Number(g.avg_score) * 10) / 10 : null,
      vulnerable: g ? Number(g.vulnerable) : 0,
      highRisk: g ? Number(g.high_risk) : 0,
      critical: g ? Number(g.critical) : 0,
    };
  });

  return ok(res, { heatmap });
});

// "Connections with NHAA helpline IVRS" - visibility into IVRS dispatch
// activity (Section 1.3's dispatch_queue rows), not a new integration.
// Explicitly labeled as queued/attempted calls, not live call monitoring.
router.get('/ivrs-log', async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = 50;
  const offset = (page - 1) * pageSize;

  // Raw pg, not Supabase REST - `count(*) over()` gets the exact total in
  // the same round trip, same convention as GET /audit-log and GET /users
  // above, instead of REST's separate `{ count: 'exact' }` request.
  let rows;
  try {
    ({ rows } = await pool.query(
      `select dispatch_id, user_id, attempt_count, delivered_at, created_at, count(*) over() as total_count
       from dispatch_queue
       where kind = 'ivrs_call'
       order by created_at desc
       limit $1 offset $2`,
      [pageSize, offset]
    ));
  } catch (err) {
    return fail(res, 'Could not load IVRS log', 500);
  }

  return ok(res, {
    entries: rows.map((d) => ({
      dispatchId: d.dispatch_id,
      userId: d.user_id,
      status: d.delivered_at ? 'delivered' : d.attempt_count > 0 ? 'attempted' : 'queued',
      attemptCount: d.attempt_count,
      queuedAt: d.created_at,
    })),
    total: rows.length > 0 ? Number(rows[0].total_count) : 0,
    note: 'Reflects queued/attempted IVRS dispatches, not a live call-monitoring feed.',
  });
});

// "Receive Base-Level Reports" - lists what District/State/National
// generated via their own POST .../reports/generate route.
//
// FIX (found while wiring Ministry Analytics & Workflow Task 4D's Inbox/
// Outbox split): migration_009 added a SECOND FK from reports into
// jurisdictions (target_jurisdiction_id, for Task 2E's upward routing)
// alongside the original jurisdiction_id one. That makes the bare
// `jurisdictions(name, level)` embed this route used to have AMBIGUOUS to
// PostgREST - confirmed live (PGRST201, "more than one relationship was
// found for 'reports' and 'jurisdictions'") - so every call to this route
// was a 500 before this fix, regardless of caller. Resolved with explicit
// FK-hint aliases (jurisdictions!<constraint_name>) instead of a second
// plain query, since (unlike the official_roles->officials ambiguity
// elsewhere in this codebase) the exact constraint names are fixed and
// known from schema.sql. Also now selects/returns the Task 2E fields
// (status, targetJurisdictionId, commentary, insightId) and resolves
// generatedByName - none of which this route returned before, even though
// the columns/data have existed since migration_009.
//
// LEAK FIX (Detailed PDF Reports): this route had NO where clause at all -
// every District/State report ever generated, Draft or not, was visible to
// Ministry regardless of who it was actually routed to.
//
// FIX #2 (Forward After Review): an EARLIER version of this fix filtered by
// `origin.level = 'national'`, reasoning that Ministry only ever receives a
// report as an explicit optional cc on National's own report. That's no
// longer true now that ANY recipient (District/State/National-tier) can
// FORWARD a report they received on to Ministry after reviewing it - a
// District-tier report a State forwards to Ministry is a real, intended
// case a tier-based filter would wrongly hide. The correct filter is
// RECIPIENT-based, not tier-based - exactly the same pattern the District/
// State/National tiers' own inbox routes already use (join through
// report_recipients, not through the report's own origin jurisdiction):
// a report is visible here whenever a report_recipients row exists with
// recipient_type='ministry' and status in ('Submitted','Reviewed') (never
// Draft - a Draft has zero report_recipients rows and was never meant to be
// visible here). origin/jurisdictionLevel/tier fields are still carried on
// every row so a future frontend pass can group Ministry's inbox by
// District/State/National reports.
router.get('/reports', async (req, res) => {
  const { jurisdictionLevel } = req.query;
  const pageSize = 30;
  const page = Math.max(1, Number(req.query.page) || 1);
  const offset = (page - 1) * pageSize;

  const { rows } = await pool.query(
    `select r.report_id, r.jurisdiction_id, r.generated_by, r.generated_at, r.period_start, r.period_end, r.snapshot,
            r.status, r.target_jurisdiction_id, r.commentary, r.insight_id, r.period_type,
            origin.name as origin_name, origin.level as origin_level,
            target.name as target_name,
            o.full_name as generator_name,
            count(*) over() as total_count
     from reports r
     left join jurisdictions origin on origin.jurisdiction_id = r.jurisdiction_id
     left join jurisdictions target on target.jurisdiction_id = r.target_jurisdiction_id
     left join officials o on o.official_id = r.generated_by
     where exists (
       select 1 from report_recipients rr
       where rr.report_id = r.report_id and rr.recipient_type = 'ministry' and rr.status in ('Submitted', 'Reviewed')
     )
     order by r.generated_at desc
     limit $1 offset $2`,
    [pageSize, offset]
  );
  const totalCount = rows.length > 0 ? Number(rows[0].total_count) : 0;

  // Batched, not N+1 - one query for every report's Ministry recipient row
  // at once, same convention the admin tiers' GET /reports uses. Joins
  // officials for the forwarder's name (Forward After Review) so
  // isForwarded/forwardedByName/forwardedAt can be surfaced the same way
  // the admin tiers' own inbox route does.
  const reportIds = rows.map((r) => r.report_id);
  let ministryRowByReportId = new Map();
  if (reportIds.length > 0) {
    const { rows: recipientRows } = await pool.query(
      `select rr.report_id, rr.recipient_id, rr.status, rr.forwarded_at, fwd.full_name as forwarded_by_name
       from report_recipients rr
       left join officials fwd on fwd.official_id = rr.forwarded_by
       where rr.report_id = any($1::uuid[]) and rr.recipient_type = 'ministry'`,
      [reportIds]
    );
    ministryRowByReportId = new Map(recipientRows.map((r) => [r.report_id, r]));
  }

  // jurisdictionLevel filter kept as a JS-side pass (not a server-side
  // filter) - no current caller passes this param, and filtering post-map
  // avoids relying on untested filter syntax under time pressure.
  let reports = rows.map((r) => {
    const myRow = ministryRowByReportId.get(r.report_id);
    return {
      reportId: r.report_id,
      jurisdictionId: r.jurisdiction_id,
      jurisdictionName: r.origin_name || null,
      jurisdictionLevel: r.origin_level || null,
      generatedBy: r.generated_by,
      generatedByName: r.generator_name || null,
      generatedAt: r.generated_at,
      periodType: r.period_type,
      periodLabel: r.snapshot?.periodLabel || null,
      periodStart: r.period_start,
      periodEnd: r.period_end,
      snapshot: r.snapshot,
      status: r.status,
      targetJurisdictionId: r.target_jurisdiction_id,
      targetJurisdictionName: r.target_name || null,
      commentary: r.commentary,
      insightId: r.insight_id,
      myRecipientId: myRow ? myRow.recipient_id : null,
      myStatus: myRow ? myRow.status : null,
      isForwarded: myRow ? !!myRow.forwarded_at : false,
      forwardedByName: myRow && myRow.forwarded_at ? myRow.forwarded_by_name || null : null,
      forwardedAt: myRow ? myRow.forwarded_at : null,
    };
  });
  if (jurisdictionLevel) reports = reports.filter((r) => r.jurisdictionLevel === jurisdictionLevel);

  return ok(res, { reports, total: totalCount });
});

// Streams the rendered PDF for one report - no jurisdiction gate, matching
// this whole router's own router.use(verifyToken, requireRole(['Ministry']), ...)
// above (Ministry is unrestricted across every jurisdiction).
router.get('/reports/:reportId/pdf', async (req, res) => {
  const { reportId } = req.params;

  const { rows: reportRows } = await pool.query(
    `select r.report_id, r.jurisdiction_id, r.generated_at, r.period_start, r.period_end, r.snapshot, r.status, r.commentary, r.period_type,
            origin.name as jurisdiction_name, origin.level as tier,
            o.full_name as generated_by_name
     from reports r
     join jurisdictions origin on origin.jurisdiction_id = r.jurisdiction_id
     left join officials o on o.official_id = r.generated_by
     where r.report_id = $1`,
    [reportId]
  );
  const report = reportRows[0];
  if (!report) return fail(res, 'Report not found', 404);

  const { rows: recipientRows } = await pool.query(
    `select rr.recipient_id, rr.recipient_type, rr.jurisdiction_id, rr.is_primary, rr.status, rr.reviewed_at,
            rr.forwarded_at, fwd.full_name as forwarded_by_name,
            j.name as jurisdiction_name
     from report_recipients rr
     left join jurisdictions j on j.jurisdiction_id = rr.jurisdiction_id
     left join officials fwd on fwd.official_id = rr.forwarded_by
     where rr.report_id = $1`,
    [reportId]
  );

  const reportForPdf = {
    jurisdictionName: report.jurisdiction_name,
    periodLabel: report.snapshot?.periodLabel || '',
    periodType: report.period_type,
    tier: report.tier,
    snapshot: report.snapshot,
    commentary: report.commentary,
    status: report.status,
    generatedByName: report.generated_by_name,
    generatedAt: report.generated_at,
    recipients: recipientRows.map((r) => ({
      recipientType: r.recipient_type,
      jurisdictionName: r.jurisdiction_name,
      isPrimary: r.is_primary,
      status: r.status,
      reviewedAt: r.reviewed_at,
      isForwarded: !!r.forwarded_at,
      forwardedByName: r.forwarded_at ? r.forwarded_by_name || null : null,
      forwardedAt: r.forwarded_at,
    })),
  };

  let buffer;
  try {
    const { html, title, periodLabel } = renderReportHtml(reportForPdf);
    buffer = await generatePdfBuffer(html, { periodLabel, title });
  } catch (err) {
    return fail(res, `Could not generate PDF: ${err.message}`, 500);
  }

  await writeAuditLog({ officialId: req.auth.officialId, action: 'export', entityType: 'report', entityId: reportId });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${report.jurisdiction_name}-report-${reportId}.pdf"`);
  return res.send(buffer);
});

// ===== Detailed PDF Reports - Forward After Review =====
// Same route/logic as the 3 admin tiers' own POST .../reports/:reportId/forward
// (this router's own verifyToken/requireRole(['Ministry'])/generalApiLimiter
// are already applied file-wide via router.use() above, so no per-route
// middleware here) - included for API completeness/consistency, but a
// Ministry caller always matches the report_recipients row via
// recipient_type='ministry', and Ministry has nothing above it, so this
// always rejects for a real Ministry caller. Ministry has no other
// jurisdiction to forward from in practice; this exists so the route shape
// is symmetric across all 4 files rather than silently 404ing here.
router.post('/reports/:reportId/forward', async (req, res) => {
  const { reportId } = req.params;

  const { rows: reportRows } = await pool.query('select report_id from reports where report_id = $1', [reportId]);
  if (!reportRows[0]) return fail(res, 'Report not found', 404);

  const { rows: recipientRows } = await pool.query(
    'select recipient_id, recipient_type, jurisdiction_id from report_recipients where report_id = $1',
    [reportId]
  );

  const myRow = recipientRows.find((r) => r.recipient_type === 'ministry');
  if (!myRow) return fail(res, 'You are not a recipient of this report', 404);

  // Ministry has nothing above it - nothing to forward to.
  return fail(res, 'Ministry has no recipient above it to forward a report to', 400);
});

module.exports = router;
