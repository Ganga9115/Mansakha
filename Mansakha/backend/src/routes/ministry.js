const express = require('express');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { supabase } = require('../db/supabaseClient');
const { pool, withTransaction } = require('../db/pgPool');
const { writeAuditLog } = require('../services/auditLog');
const { verifyToken } = require('../middleware/verifyToken');
const { requireRole } = require('../middleware/requireRole');
const { generalApiLimiter } = require('../middleware/rateLimiter');
const { ok, fail } = require('../services/responseEnvelope');
const { getDescendantJurisdictionIds } = require('../services/jurisdictionTree');

const router = express.Router();

router.use(verifyToken, requireRole(['Ministry']), generalApiLimiter);

const CREATABLE_ROLES = ['Administration', 'Counsellor', 'Data Operator'];
const JURISDICTION_LIMITED_LEVELS = ['district', 'state']; // Feature Catalog Section 6.2: "Limit: 1 per District/State"

// Section 6.2's new validation - an Administration account at district or
// state level can't be created (or granted) where an active one already
// exists for that exact jurisdiction. National Administration and Counsellor
// have no stated limit; Data Operator isn't jurisdiction-scoped at all.
async function checkJurisdictionLimit(roleName, jurisdictionId) {
  if (roleName !== 'Administration' || !jurisdictionId) return null;

  const { data: level } = await supabase.from('jurisdictions').select('level').eq('jurisdiction_id', jurisdictionId).maybeSingle();
  if (!level || !JURISDICTION_LIMITED_LEVELS.includes(level.level)) return null;

  const { data: existing } = await supabase
    .from('official_roles')
    .select('official_role_id, roles(role_name)')
    .eq('jurisdiction_id', jurisdictionId)
    .is('revoked_at', null);

  const alreadyHasAdmin = (existing || []).some((r) => r.roles.role_name === 'Administration');
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
  const { page = 1, role, level } = req.query;
  const pageSize = 30;
  const offset = (Number(page) - 1) * pageSize;

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
    const { rows: countRows } = await pool.query(
      `select count(*) from officials o
       join official_roles orl on orl.official_id = o.official_id
       join roles r on r.role_id = orl.role_id
       left join jurisdictions j on j.jurisdiction_id = orl.jurisdiction_id
       where ${whereClause}`,
      params
    );

    const { rows } = await pool.query(
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
    );

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

// Ministry-wide victim list for Super Admin visibility (Feature Catalog
// Section 3/8's oversight remit) - every victim regardless of who
// provisioned them (District Admin or Data Operator), unlike Data Operator's
// own /api/dataintake/victims which only shows its own auth_method. Read-only
// here; editing/deleting a victim record stays on the Data Operator screen
// that already owns that flow.
router.get('/victims', async (req, res) => {
  const { page = 1 } = req.query;
  const pageSize = 30;
  const offset = (Number(page) - 1) * pageSize;

  const { data, count, error } = await supabase
    .from('victims')
    .select(
      `victim_id, docket_number, case_stage, status, auth_method, enrolled_at,
       case_types(name), jurisdictions(name), victim_identity(full_name, contact_number, address)`,
      { count: 'exact' }
    )
    .order('enrolled_at', { ascending: false })
    .range(offset, offset + pageSize - 1);
  if (error) return fail(res, `Could not load victims: ${error.message}`, 500);

  const victims = (data || []).map((v) => ({
    victimId: v.victim_id,
    docketNumber: v.docket_number,
    fullName: v.victim_identity?.full_name || null,
    contactNumber: v.victim_identity?.contact_number || null,
    address: v.victim_identity?.address || null,
    caseType: v.case_types?.name || null,
    jurisdictionName: v.jurisdictions?.name || null,
    caseStage: v.case_stage,
    status: v.status,
    provisionedVia: v.auth_method === 'district_admin' ? 'District Admin' : 'Data Operator',
    enrolledAt: v.enrolled_at,
  }));

  return ok(res, { victims, total: count || victims.length, page: Number(page), pageSize });
});

// Extends Section 7's contract (explicitly allowed: "extend as needed, keep the
// shape consistent") with what Section 3/8 requires for Ministry to function at
// all: nothing else can onboard staff without this.
router.post('/staff', async (req, res) => {
  const { fullName, email, roleName, jurisdictionId, password, staffId, phone, whatsappNumber } = req.body;
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
  // phone doubles as this account's 4th login credential for Counsellor
  // specifically (routes/auth.staff.js) - without it the account could never
  // log in at all, so Ministry can't create one without setting it.
  if (roleName === 'Counsellor' && !phone) {
    return fail(res, 'phone is required for Counsellor accounts (also used as their login credential)', 400);
  }

  const limitError = await checkJurisdictionLimit(roleName, jurisdictionId);
  if (limitError) return fail(res, limitError, 409);

  const { data: roleRow } = await supabase.from('roles').select('role_id').eq('role_name', roleName).single();

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
        // target (routes/victim.js's /assigned-counsellor).
        `insert into officials (full_name, email, password_hash, must_change_password, staff_id, phone, whatsapp_number, provisioned_by)
         values ($1, $2, $3, true, $4, $5, $6, $7)
         returning official_id`,
        [fullName, email, passwordHash, staffId || '1', phone || null, whatsappNumber || null, req.auth.officialId]
      );
      const id = rows[0].official_id;
      await client.query(
        `insert into official_roles (official_id, role_id, jurisdiction_id, assigned_by) values ($1, $2, $3, $4)`,
        [id, roleRow.role_id, roleName === 'Administration' ? jurisdictionId : jurisdictionId || null, req.auth.officialId]
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

  // Clearing phone on an active Counsellor would lock them out of login
  // entirely (their 4th credential, routes/auth.staff.js) - block it rather
  // than let an edit silently strand the account.
  if (phone === '' || phone === null) {
    const { data: roleRows } = await supabase
      .from('official_roles')
      .select('roles(role_name)')
      .eq('official_id', officialId)
      .is('revoked_at', null);
    const isCounsellor = (roleRows || []).some((r) => r.roles.role_name === 'Counsellor');
    if (isCounsellor) return fail(res, 'phone cannot be cleared for a Counsellor account - it is required for login', 400);
  }

  const patch = {};
  if (fullName) patch.full_name = fullName;
  if (phone !== undefined) patch.phone = phone || null;
  if (whatsappNumber !== undefined) patch.whatsapp_number = whatsappNumber || null;
  if (staffId) patch.staff_id = staffId;
  if (newPassword) {
    patch.password_hash = await bcrypt.hash(newPassword, 12);
    patch.must_change_password = true;
  }

  const { error } = await supabase.from('officials').update(patch).eq('official_id', officialId);
  if (error) return fail(res, `Could not update account: ${error.message}`, 500);

  await writeAuditLog({ officialId: req.auth.officialId, action: 'update', entityType: 'official', entityId: officialId });

  return ok(res, null, 'Account updated');
});

// Every table with an official_id-shaped foreign key into officials (besides
// official_roles, which is this account's own role grant and gets deleted
// alongside it, not treated as "history"). Checked up front by the delete
// route below, same reasoning/pattern as victimProvisioning.js's deleteVictim.
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
  const { roleName, jurisdictionId } = req.body;
  if (!roleName) return fail(res, 'roleName is required', 400);
  if (!CREATABLE_ROLES.includes(roleName)) return fail(res, `roleName must be one of: ${CREATABLE_ROLES.join(', ')}`, 400);
  if (roleName === 'Administration' && !jurisdictionId) return fail(res, 'jurisdictionId is required for Administration accounts', 400);

  const limitError = await checkJurisdictionLimit(roleName, jurisdictionId);
  if (limitError) return fail(res, limitError, 409);

  const { data: official } = await supabase.from('officials').select('official_id').eq('official_id', officialId).maybeSingle();
  if (!official) return fail(res, 'Account not found', 404);

  const { data: roleRow } = await supabase.from('roles').select('role_id').eq('role_name', roleName).single();

  const { data, error } = await supabase
    .from('official_roles')
    .insert({ official_id: officialId, role_id: roleRow.role_id, jurisdiction_id: jurisdictionId || null, assigned_by: req.auth.officialId })
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
  const { page = 1 } = req.query;
  const pageSize = 50;
  const offset = (Number(page) - 1) * pageSize;

  const { data, count, error } = await supabase
    .from('audit_log')
    .select('log_id, official_id, victim_id, action, entity_type, entity_id, occurred_at', { count: 'exact' })
    .order('occurred_at', { ascending: false })
    .range(offset, offset + pageSize - 1);
  if (error) return fail(res, 'Could not load audit log', 500);

  return ok(res, { entries: data || [], total: count || 0 });
});

router.get('/languages', async (req, res) => {
  const { data, error } = await supabase.from('languages').select('language_id, code, name').is('deleted_at', null).order('name');
  if (error) return fail(res, 'Could not load languages', 500);
  return ok(res, { languages: data || [] });
});

router.post('/languages', async (req, res) => {
  const { code, name } = req.body;
  if (!code || !name) return fail(res, 'code and name are required', 400);

  const { data, error } = await supabase.from('languages').insert({ code, name }).select('language_id').single();
  if (error) return fail(res, `Could not add language: ${error.message}`, 500);

  await writeAuditLog({ officialId: req.auth.officialId, action: 'create', entityType: 'language', entityId: data.language_id });

  return ok(res, { languageId: data.language_id }, 'Language added', 201);
});

router.patch('/languages/:languageId', async (req, res) => {
  const { languageId } = req.params;
  const { code, name } = req.body;
  if (!code && !name) return fail(res, 'code or name is required', 400);

  const patch = {};
  if (code) patch.code = code;
  if (name) patch.name = name;

  const { error } = await supabase.from('languages').update(patch).eq('language_id', languageId);
  if (error) return fail(res, `Could not update language: ${error.message}`, 500);

  await writeAuditLog({ officialId: req.auth.officialId, action: 'update', entityType: 'language', entityId: languageId });

  return ok(res, null, 'Language updated');
});

// Soft-delete - victims.preferred_language FKs into this table, so a
// language a victim already picked must keep resolving even after it's
// removed from the selectable list.
router.delete('/languages/:languageId', async (req, res) => {
  const { languageId } = req.params;

  const { error } = await supabase.from('languages').update({ deleted_at: new Date().toISOString() }).eq('language_id', languageId);
  if (error) return fail(res, `Could not remove language: ${error.message}`, 500);

  await writeAuditLog({ officialId: req.auth.officialId, action: 'delete', entityType: 'language', entityId: languageId });

  return ok(res, null, 'Language removed');
});

// ===== Feature Catalog Section 6.4 - "Manage case types" / "Manage
// intervention types" / "Manage channels", the same GET/POST/PATCH/DELETE
// soft-delete pattern as languages above (each written out explicitly,
// matching this codebase's existing style rather than a generic CRUD
// factory - languages itself is written the same longhand way). victims.
// case_type_id / distress_scores.suggested_intervention_type_id /
// interactions.channel_id all FK into these, so removal is soft-delete only,
// same reasoning as languages. =====

router.get('/case-types', async (req, res) => {
  const { data, error } = await supabase.from('case_types').select('case_type_id, name').is('deleted_at', null).order('name');
  if (error) return fail(res, 'Could not load case types', 500);
  return ok(res, { caseTypes: data || [] });
});

router.post('/case-types', async (req, res) => {
  const { name } = req.body;
  if (!name) return fail(res, 'name is required', 400);

  const { data, error } = await supabase.from('case_types').insert({ name }).select('case_type_id').single();
  if (error) return fail(res, `Could not add case type: ${error.message}`, 500);

  await writeAuditLog({ officialId: req.auth.officialId, action: 'create', entityType: 'case_type', entityId: data.case_type_id });
  return ok(res, { caseTypeId: data.case_type_id }, 'Case type added', 201);
});

router.patch('/case-types/:caseTypeId', async (req, res) => {
  const { caseTypeId } = req.params;
  const { name } = req.body;
  if (!name) return fail(res, 'name is required', 400);

  const { error } = await supabase.from('case_types').update({ name }).eq('case_type_id', caseTypeId);
  if (error) return fail(res, `Could not update case type: ${error.message}`, 500);

  await writeAuditLog({ officialId: req.auth.officialId, action: 'update', entityType: 'case_type', entityId: caseTypeId });
  return ok(res, null, 'Case type updated');
});

router.delete('/case-types/:caseTypeId', async (req, res) => {
  const { caseTypeId } = req.params;

  const { error } = await supabase.from('case_types').update({ deleted_at: new Date().toISOString() }).eq('case_type_id', caseTypeId);
  if (error) return fail(res, `Could not remove case type: ${error.message}`, 500);

  await writeAuditLog({ officialId: req.auth.officialId, action: 'delete', entityType: 'case_type', entityId: caseTypeId });
  return ok(res, null, 'Case type removed');
});

router.get('/intervention-types', async (req, res) => {
  const { data, error } = await supabase.from('intervention_types').select('intervention_type_id, name').is('deleted_at', null).order('name');
  if (error) return fail(res, 'Could not load intervention types', 500);
  return ok(res, { interventionTypes: data || [] });
});

router.post('/intervention-types', async (req, res) => {
  const { name } = req.body;
  if (!name) return fail(res, 'name is required', 400);

  const { data, error } = await supabase.from('intervention_types').insert({ name }).select('intervention_type_id').single();
  if (error) return fail(res, `Could not add intervention type: ${error.message}`, 500);

  await writeAuditLog({ officialId: req.auth.officialId, action: 'create', entityType: 'intervention_type', entityId: data.intervention_type_id });
  return ok(res, { interventionTypeId: data.intervention_type_id }, 'Intervention type added', 201);
});

router.patch('/intervention-types/:interventionTypeId', async (req, res) => {
  const { interventionTypeId } = req.params;
  const { name } = req.body;
  if (!name) return fail(res, 'name is required', 400);

  const { error } = await supabase.from('intervention_types').update({ name }).eq('intervention_type_id', interventionTypeId);
  if (error) return fail(res, `Could not update intervention type: ${error.message}`, 500);

  await writeAuditLog({ officialId: req.auth.officialId, action: 'update', entityType: 'intervention_type', entityId: interventionTypeId });
  return ok(res, null, 'Intervention type updated');
});

router.delete('/intervention-types/:interventionTypeId', async (req, res) => {
  const { interventionTypeId } = req.params;

  const { error } = await supabase.from('intervention_types').update({ deleted_at: new Date().toISOString() }).eq('intervention_type_id', interventionTypeId);
  if (error) return fail(res, `Could not remove intervention type: ${error.message}`, 500);

  await writeAuditLog({ officialId: req.auth.officialId, action: 'delete', entityType: 'intervention_type', entityId: interventionTypeId });
  return ok(res, null, 'Intervention type removed');
});

router.get('/channels', async (req, res) => {
  const { data, error } = await supabase.from('channels').select('channel_id, channel_name').is('deleted_at', null).order('channel_name');
  if (error) return fail(res, 'Could not load channels', 500);
  return ok(res, { channels: data || [] });
});

router.post('/channels', async (req, res) => {
  const { channelName } = req.body;
  if (!channelName) return fail(res, 'channelName is required', 400);

  const { data, error } = await supabase.from('channels').insert({ channel_name: channelName }).select('channel_id').single();
  if (error) return fail(res, `Could not add channel: ${error.message}`, 500);

  await writeAuditLog({ officialId: req.auth.officialId, action: 'create', entityType: 'channel', entityId: data.channel_id });
  return ok(res, { channelId: data.channel_id }, 'Channel added', 201);
});

router.patch('/channels/:channelId', async (req, res) => {
  const { channelId } = req.params;
  const { channelName } = req.body;
  if (!channelName) return fail(res, 'channelName is required', 400);

  const { error } = await supabase.from('channels').update({ channel_name: channelName }).eq('channel_id', channelId);
  if (error) return fail(res, `Could not update channel: ${error.message}`, 500);

  await writeAuditLog({ officialId: req.auth.officialId, action: 'update', entityType: 'channel', entityId: channelId });
  return ok(res, null, 'Channel updated');
});

router.delete('/channels/:channelId', async (req, res) => {
  const { channelId } = req.params;

  const { error } = await supabase.from('channels').update({ deleted_at: new Date().toISOString() }).eq('channel_id', channelId);
  if (error) return fail(res, `Could not remove channel: ${error.message}`, 500);

  await writeAuditLog({ officialId: req.auth.officialId, action: 'delete', entityType: 'channel', entityId: channelId });
  return ok(res, null, 'Channel removed');
});

// ===== Feature Catalog Section 6.3 =====

// "Heatmaps by state / region" - pure aggregation, no new table. One row per
// state: victim count + average of each victim's most recent distress score.
router.get('/heatmap', async (req, res) => {
  const { data: states, error: stateError } = await supabase.from('jurisdictions').select('jurisdiction_id, name').eq('level', 'state');
  if (stateError) return fail(res, 'Could not load heatmap', 500);

  const heatmap = [];
  for (const state of states || []) {
    const descendantIds = await getDescendantJurisdictionIds(state.jurisdiction_id);
    const { data: victims } = await supabase
      .from('victims')
      .select('victim_id, distress_scores(score_value, computed_at)')
      .in('jurisdiction_id', descendantIds);

    let victimCount = 0;
    let scoreSum = 0;
    let scoredCount = 0;
    for (const v of victims || []) {
      victimCount += 1;
      const latest = (v.distress_scores || []).sort((a, b) => (a.computed_at < b.computed_at ? 1 : -1))[0];
      if (latest) {
        scoreSum += latest.score_value;
        scoredCount += 1;
      }
    }

    heatmap.push({
      jurisdictionId: state.jurisdiction_id,
      name: state.name,
      victimCount,
      averageScore: scoredCount > 0 ? Math.round((scoreSum / scoredCount) * 10) / 10 : null,
    });
  }

  return ok(res, { heatmap });
});

// "Connections with NHAA helpline IVRS" - visibility into IVRS dispatch
// activity (Section 1.3's dispatch_queue rows), not a new integration.
// Explicitly labeled as queued/attempted calls, not live call monitoring.
router.get('/ivrs-log', async (req, res) => {
  const { page = 1 } = req.query;
  const pageSize = 50;
  const offset = (Number(page) - 1) * pageSize;

  const { data, count, error } = await supabase
    .from('dispatch_queue')
    .select('dispatch_id, victim_id, attempt_count, delivered_at, created_at', { count: 'exact' })
    .eq('kind', 'ivrs_call')
    .order('created_at', { ascending: false })
    .range(offset, offset + pageSize - 1);
  if (error) return fail(res, 'Could not load IVRS log', 500);

  return ok(res, {
    entries: (data || []).map((d) => ({
      dispatchId: d.dispatch_id,
      victimId: d.victim_id,
      status: d.delivered_at ? 'delivered' : d.attempt_count > 0 ? 'attempted' : 'queued',
      attemptCount: d.attempt_count,
      queuedAt: d.created_at,
    })),
    total: count || 0,
    note: 'Reflects queued/attempted IVRS dispatches, not a live call-monitoring feed.',
  });
});

// "Receive Base-Level Reports" - lists what District/State/National
// generated via POST /api/admin/reports/generate.
router.get('/reports', async (req, res) => {
  const { jurisdictionLevel, page = 1 } = req.query;
  const pageSize = 30;
  const offset = (Number(page) - 1) * pageSize;

  let query = supabase
    .from('reports')
    .select('report_id, jurisdiction_id, generated_by, generated_at, period_start, period_end, snapshot, jurisdictions(name, level)', { count: 'exact' })
    .order('generated_at', { ascending: false });
  if (jurisdictionLevel) query = query.eq('jurisdictions.level', jurisdictionLevel);

  const { data, count, error } = await query.range(offset, offset + pageSize - 1);
  if (error) return fail(res, `Could not load reports: ${error.message}`, 500);

  return ok(res, {
    reports: (data || []).map((r) => ({
      reportId: r.report_id,
      jurisdictionId: r.jurisdiction_id,
      jurisdictionName: r.jurisdictions ? r.jurisdictions.name : null,
      jurisdictionLevel: r.jurisdictions ? r.jurisdictions.level : null,
      generatedBy: r.generated_by,
      generatedAt: r.generated_at,
      periodStart: r.period_start,
      periodEnd: r.period_end,
      snapshot: r.snapshot,
    })),
    total: count || 0,
  });
});

module.exports = router;
