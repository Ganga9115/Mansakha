const express = require('express');
const { pool } = require('../../core/db/pgPool');
const { verifyToken } = require('../../core/middleware/verifyToken');
const { requireRole } = require('../../core/middleware/requireRole');
const { generalApiLimiter } = require('../../core/middleware/rateLimiter');
const { ok, fail } = require('../../core/services/responseEnvelope');
const { createUser, updateUser, deleteUser, linkExistingCase, createLinkedCase, ProvisioningError } = require('../../user/services/userProvisioning');
const { writeAuditLog } = require('../../core/services/auditLog');

const router = express.Router();

router.use(verifyToken, requireRole(['Data Operator']), generalApiLimiter);

// Feature Catalog Section 7 - identical creation logic to District Admin's
// POST /api/admin/district/users (user/services/userProvisioning.js), but deliberately
// NOT jurisdiction-locked: Data Operator is framed as an integration/
// intake role that can register a user into any district, not a
// district-operational one - so no requireJurisdiction here.
router.post('/register-user', async (req, res) => {
  const { docketNumber, fullName, contactNumber, jurisdictionId, caseTypeId, caseStage, address, caseBackground, password, aadhaarNumber, stationId } = req.body;
  try {
    const { userId, temporaryPassword } = await createUser({
      docketNumber, fullName, contactNumber, jurisdictionId, caseTypeId, caseStage, address, caseBackground, password, aadhaarNumber, stationId,
      provisionedVia: 'data_operator',
    });
    await writeAuditLog({ officialId: req.auth.officialId, userId, action: 'create', entityType: 'user', entityId: userId });
    return ok(res, { userId, docketNumber, temporaryPassword }, 'User record created', 201);
  } catch (err) {
    if (err instanceof ProvisioningError) return fail(res, err.message, err.status);
    throw err;
  }
});

// Feature Catalog Section 7 - EXPLICITLY SIMULATED. This is a placeholder for
// a real NHAA/Integrated Portal API integration that does not exist yet - it
// must never read as a working government API connection, in code or in any
// response shown to a user, so every result carries a clear "Simulated data"
// label the frontend is required to render, not just a comment here.
// Explicit request: a fetched "case" should carry every field Register User
// actually needs (name, contact, case type, case stage, state/district,
// background), not just case type/stage - so the fetched result can be
// reviewed and used to pre-fill that form directly (see the frontend's "Use
// These Details" button), matching what a real NHAA/Integrated Portal record
// would plausibly hand over once/if that integration ever exists.
const FIRST_NAMES = ['Aarav', 'Vivaan', 'Aditya', 'Vihaan', 'Arjun', 'Ishaan', 'Kabir', 'Rohan', 'Diya', 'Riya', 'Saanvi', 'Anaya', 'Priya', 'Meera', 'Kavya', 'Ananya'];
const LAST_NAMES = ['Sharma', 'Verma', 'Patel', 'Singh', 'Reddy', 'Das', 'Nair', 'Gupta', 'Iyer', 'Chauhan', 'Mehta', 'Joshi'];

router.post('/fetch-case', async (req, res) => {
  const { docketNumber } = req.body;
  if (!docketNumber) return fail(res, 'docketNumber is required', 400);

  // Deterministic fixture derived from the input, not random - so the same
  // docket number always "fetches" the same plausible-looking result during
  // a demo, without pretending to hit a real backing system.
  const seed = String(docketNumber).split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  const stages = ['Investigation', 'Trial', 'Rehabilitation', 'Compensation'];

  // Both raw pg (not Supabase REST) - same ~500-650ms-per-call PostgREST cost
  // documented elsewhere this session, felt here on every "Fetch Case" click.
  const [{ rows: caseTypes }, { rows: districts }] = await Promise.all([
    pool.query('select case_type_id, name from case_types where deleted_at is null order by name'),
    pool.query(
      `select d.jurisdiction_id as district_id, d.name as district_name, s.jurisdiction_id as state_id, s.name as state_name
       from jurisdictions d
       join jurisdictions s on s.jurisdiction_id = d.parent_id
       where d.level = 'district'
       order by d.name`
    ),
  ]);

  const caseType = caseTypes && caseTypes.length ? caseTypes[seed % caseTypes.length] : null;
  const district = districts.length ? districts[seed % districts.length] : null;
  const fullName = `${FIRST_NAMES[seed % FIRST_NAMES.length]} ${LAST_NAMES[(seed * 7) % LAST_NAMES.length]}`;
  // 10-digit Indian mobile format (starts 6-9) - deterministic per seed, not
  // a real number.
  const contactNumber = String(6000000000 + (seed * 9999991) % 4000000000).slice(0, 10);
  // 12-digit Aadhaar-like format, same deterministic-per-seed approach as
  // name/contact above - Multi-Case-Per-Person Support's primary matching
  // key (see userProvisioning.js/migration_022): a real NHAA record would
  // plausibly carry this, and it's what lets Data Operator recognize two
  // different docket numbers as the same person.
  const aadhaarNumber = String(100000000000 + (seed * 8951) % 899999999999).slice(0, 12);

  // Proactive match check - if this Aadhaar already belongs to a DIFFERENT
  // existing case, surface it immediately so the operator can link on the
  // spot instead of discovering the conflict only after submitting Register
  // User (which would 409 on the same constraint - see createUser()).
  // Raw pg (not Supabase REST) - a real join instead of a users(docket_number)
  // embed; user_identity.user_id -> users.user_id is a single, unambiguous FK
  // (unlike official_roles' two-FKs-into-officials case documented elsewhere).
  const { rows: existingIdentityRows } = await pool.query(
    `select ui.user_id, ui.full_name, u.docket_number
     from user_identity ui
     join users u on u.user_id = ui.user_id
     where ui.aadhaar_number = $1
     limit 1`,
    [aadhaarNumber]
  );
  const existingIdentity = existingIdentityRows[0];
  const existingMatch = (existingIdentity && existingIdentity.docket_number !== String(docketNumber).trim())
    ? { userId: existingIdentity.user_id, docketNumber: existingIdentity.docket_number || null, fullName: existingIdentity.full_name }
    : null;

  await writeAuditLog({ officialId: req.auth.officialId, action: 'read', entityType: 'simulated_case_fetch' });

  return ok(res, {
    simulated: true,
    docketNumber,
    suggestedFullName: fullName,
    suggestedContactNumber: contactNumber,
    suggestedCaseTypeId: caseType?.case_type_id || null,
    suggestedCaseType: caseType?.name || null,
    suggestedCaseStage: stages[seed % stages.length],
    suggestedStateId: district?.state_id || null,
    suggestedStateName: district?.state_name || null,
    suggestedDistrictId: district?.district_id || null,
    suggestedDistrictName: district?.district_name || null,
    suggestedCaseBackground: `Referred via NHAA helpline (simulated) - caller reported an incident consistent with ${caseType?.name || 'the suggested case type'} and requested follow-up support.`,
    suggestedAadhaarNumber: aadhaarNumber,
    existingMatch,
    note: 'Simulated data - placeholder for a real NHAA/Integrated Portal API integration that does not exist yet. Not a live government record.',
  });
});

// "Users" sidebar feature - every user created via this Data
// Operator flow (auth_method = 'data_operator'), not scoped to the specific
// official who created it - Data Operator isn't jurisdiction- or
// creator-scoped anywhere else either (Section 7), so this stays consistent
// with that. Full detail (identity + case + jurisdiction), not just the
// truncated fields Counsellor's My Users list shows.
router.get('/users', async (req, res) => {
  // Raw pg (not Supabase REST) in one query - a PostgREST round trip costs
  // ~1-2s here (documented elsewhere in this codebase's raw-pg conversions),
  // and the previous version did two of them sequentially (users, then a
  // separate user_identity lookup) for what's this screen's own landing
  // page, felt on every load. ui joined via coalesce(linked_to_user_id,
  // user_id) - a dependent case (Multi-Case-Per-Person Support) has no
  // user_identity row of its own (it inherits the anchor's - see
  // createLinkedCase in userProvisioning.js), so joining on u.user_id
  // directly would show a blank name/contact/address for one even though
  // the real person's identity is known via their other case.
  const { rows } = await pool.query(
    `select u.user_id, u.docket_number, u.case_stage, u.status, u.case_background, u.enrolled_at,
            ct.name as case_type_name, j.name as jurisdiction_name,
            ui.full_name, ui.contact_number, ui.address
     from users u
     left join case_types ct on ct.case_type_id = u.case_type_id
     left join jurisdictions j on j.jurisdiction_id = u.jurisdiction_id
     left join user_identity ui on ui.user_id = coalesce(u.linked_to_user_id, u.user_id)
     where u.auth_method = 'data_operator'
     order by u.enrolled_at desc`
  );

  return ok(res, {
    users: rows.map((u) => ({
      userId: u.user_id,
      docketNumber: u.docket_number,
      fullName: u.full_name || null,
      contactNumber: u.contact_number || null,
      address: u.address || null,
      caseType: u.case_type_name || null,
      jurisdictionName: u.jurisdiction_name || null,
      caseStage: u.case_stage,
      status: u.status,
      caseBackground: u.case_background,
      enrolledAt: u.enrolled_at,
    })),
  });
});

router.patch('/users/:userId', async (req, res) => {
  const { userId } = req.params;
  const { caseStage, status, address, contactNumber } = req.body;
  try {
    // canCloseCase: true - marking a case 'Case Closed' after Compensation is
    // explicitly a Data Operator action, per request; District Admin's
    // equivalent route (district_admin/routes/districtAdmin.routes.js) does not set this.
    await updateUser(userId, { caseStage, status, address, contactNumber }, { canCloseCase: true });
    await writeAuditLog({ officialId: req.auth.officialId, userId, action: 'update', entityType: 'user', entityId: userId });
    return ok(res, null, 'User record updated');
  } catch (err) {
    if (err instanceof ProvisioningError) return fail(res, err.message, err.status);
    throw err;
  }
});

router.delete('/users/:userId', async (req, res) => {
  const { userId } = req.params;
  try {
    await deleteUser(userId);
    await writeAuditLog({ officialId: req.auth.officialId, userId, action: 'delete', entityType: 'user', entityId: userId });
    return ok(res, null, 'User record deleted');
  } catch (err) {
    if (err instanceof ProvisioningError) return fail(res, err.message, err.status);
    throw err;
  }
});

// Multi-Case-Per-Person Support - the search behind "Link Cases": finds an
// existing PERSON (not just a case row) by name/docket/contact/Aadhaar, so a
// new or already-registered case can be linked to them. Deliberately
// unfiltered by auth_method (unlike GET /users above) - a person's other
// case may have been registered by District Admin, not Data Operator, and
// this still needs to find them. Results are grouped by resolved anchor so a
// person with several cases appears once, with every one of their cases
// listed, not once per matching row.
router.get('/search-person', async (req, res) => {
  const q = (req.query.q || '').trim();
  if (q.length < 2) return ok(res, { people: [] });
  const escaped = q.replace(/[%_\\]/g, '\\$&');

  // Two independent match paths: docket_number lives on `users` (and a match
  // there might land on a DEPENDENT case, which has no user_identity row of
  // its own - resolved to its anchor below); name/contact/aadhaar live on
  // `user_identity`, which only an anchor row ever has.
  //
  // Raw pg (not Supabase REST) throughout this route - the explicit
  // "Data Operator case-lookup" read path this codebase's raw-pg conversions
  // target; same ~500-650ms-per-PostgREST-round-trip cost documented
  // elsewhere this session, felt here on every keystroke of this search box.
  const likeParam = `%${escaped}%`;
  const [{ rows: docketMatches }, { rows: identityMatches }] = await Promise.all([
    pool.query('select user_id, linked_to_user_id from users where docket_number ilike $1 limit 25', [likeParam]),
    pool.query(
      `select user_id from user_identity
       where full_name ilike $1 or contact_number ilike $1 or aadhaar_number ilike $1
       limit 25`,
      [likeParam]
    ),
  ]);

  const anchorIds = new Set();
  for (const m of docketMatches) anchorIds.add(m.linked_to_user_id || m.user_id);
  for (const m of identityMatches) anchorIds.add(m.user_id); // user_identity.user_id is always an anchor already
  if (anchorIds.size === 0) return ok(res, { people: [] });

  const anchorIdArray = [...anchorIds];
  // Real joins instead of case_types(name)/jurisdictions(name) embeds -
  // users.case_type_id -> case_types.case_type_id and users.jurisdiction_id
  // -> jurisdictions.jurisdiction_id are both single, unambiguous FKs
  // (unlike official_roles' two-FKs-into-officials case documented elsewhere).
  const [{ rows: familyRows }, { rows: identities }] = await Promise.all([
    pool.query(
      `select u.user_id, u.linked_to_user_id, u.docket_number, u.case_stage,
              ct.name as case_type_name, j.name as jurisdiction_name
       from users u
       left join case_types ct on ct.case_type_id = u.case_type_id
       left join jurisdictions j on j.jurisdiction_id = u.jurisdiction_id
       where u.user_id = any($1::uuid[]) or u.linked_to_user_id = any($1::uuid[])`,
      [anchorIdArray]
    ),
    pool.query('select user_id, full_name, contact_number, aadhaar_number from user_identity where user_id = any($1::uuid[])', [anchorIdArray]),
  ]);

  const identityByAnchor = new Map(identities.map((i) => [i.user_id, i]));
  const casesByAnchor = new Map();
  for (const row of familyRows) {
    const anchorId = row.linked_to_user_id || row.user_id;
    if (!casesByAnchor.has(anchorId)) casesByAnchor.set(anchorId, []);
    casesByAnchor.get(anchorId).push({
      userId: row.user_id,
      docketNumber: row.docket_number,
      caseStage: row.case_stage,
      caseType: row.case_type_name || null,
      jurisdictionName: row.jurisdiction_name || null,
    });
  }

  const people = anchorIdArray
    .map((anchorId) => {
      const identity = identityByAnchor.get(anchorId);
      return {
        anchorUserId: anchorId,
        fullName: identity?.full_name || null,
        contactNumber: identity?.contact_number || null,
        aadhaarNumber: identity?.aadhaar_number || null,
        cases: casesByAnchor.get(anchorId) || [],
      };
    })
    .filter((p) => p.cases.length > 0);

  return ok(res, { people });
});

// Registers a brand-new case that's already known to belong to an existing
// person (found via /search-person, or a Fetch Case Aadhaar match) - a
// trimmed version of /register-user with no name/contact/password fields,
// since a dependent case inherits the anchor's identity and gets its own
// default temp password (see createLinkedCase in userProvisioning.js).
router.post('/register-linked-case', async (req, res) => {
  const { docketNumber, caseTypeId, jurisdictionId, caseStage, caseBackground, linkToUserId } = req.body;
  try {
    const { userId, docketNumber: dn, temporaryPassword, anchorUserId } = await createLinkedCase({
      docketNumber, caseTypeId, jurisdictionId, caseStage, caseBackground, linkToUserId,
      provisionedVia: 'data_operator',
    });
    await writeAuditLog({ officialId: req.auth.officialId, userId, action: 'create', entityType: 'user', entityId: userId });
    return ok(res, { userId, docketNumber: dn, temporaryPassword, anchorUserId }, 'Linked case created', 201);
  } catch (err) {
    if (err instanceof ProvisioningError) return fail(res, err.message, err.status);
    throw err;
  }
});

// Links two already-independently-registered cases together after the fact
// (the "these two docket numbers turned out to be the same person" cleanup
// case) - see linkExistingCase's own rejection conditions (self-link,
// already-linked, already-an-anchor-with-dependents, already has its own
// activity) in userProvisioning.js for why this can fail with a 409.
router.post('/users/:userId/link', async (req, res) => {
  const { userId } = req.params;
  const { linkToUserId } = req.body;
  if (!linkToUserId) return fail(res, 'linkToUserId is required', 400);
  try {
    const { anchorUserId } = await linkExistingCase(userId, linkToUserId);
    await writeAuditLog({ officialId: req.auth.officialId, userId, action: 'update', entityType: 'user_link', entityId: userId });
    return ok(res, { anchorUserId }, 'Case linked');
  } catch (err) {
    if (err instanceof ProvisioningError) return fail(res, err.message, err.status);
    throw err;
  }
});

module.exports = router;
