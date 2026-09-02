const express = require('express');
const { supabase } = require('../../core/db/supabaseClient');
const { pool } = require('../../core/db/pgPool');
const { verifyToken } = require('../../core/middleware/verifyToken');
const { requireRole } = require('../../core/middleware/requireRole');
const { generalApiLimiter } = require('../../core/middleware/rateLimiter');
const { ok, fail } = require('../../core/services/responseEnvelope');
const { createUser, updateUser, deleteUser, ProvisioningError } = require('../../user/services/userProvisioning');
const { writeAuditLog } = require('../../core/services/auditLog');

const router = express.Router();

router.use(verifyToken, requireRole(['Data Operator']), generalApiLimiter);

// Feature Catalog Section 7 - identical creation logic to District Admin's
// POST /api/admin/district/users (user/services/userProvisioning.js), but deliberately
// NOT jurisdiction-locked: Data Operator is framed as an integration/
// intake role that can register a user into any district, not a
// district-operational one - so no requireJurisdiction here.
router.post('/register-user', async (req, res) => {
  const { docketNumber, fullName, contactNumber, jurisdictionId, caseTypeId, caseStage, address, caseBackground, password } = req.body;
  try {
    const { userId, temporaryPassword } = await createUser({
      docketNumber, fullName, contactNumber, jurisdictionId, caseTypeId, caseStage, address, caseBackground, password,
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

  const [{ data: caseTypes }, { rows: districts }] = await Promise.all([
    supabase.from('case_types').select('case_type_id, name').is('deleted_at', null).order('name'),
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
    note: 'Simulated data - placeholder for a real NHAA/Integrated Portal API integration that does not exist yet. Not a live government record.',
  });
});

// "Users" sidebar feature - every user created via this Data
// Operator flow (auth_method = 'data_operator'), not scoped to the specific
// official who created it - Data Operator isn't jurisdiction- or
// creator-scoped anywhere else either (Section 7), so this stays consistent
// with that. Full detail (identity + case + jurisdiction), not just the
// truncated fields Counsellor's case queue shows.
router.get('/users', async (req, res) => {
  const { data, error } = await supabase
    .from('users')
    .select(`
      user_id, docket_number, case_stage, status, case_background, enrolled_at,
      case_types(name),
      jurisdictions(name),
      user_identity(full_name, contact_number, address)
    `)
    .eq('auth_method', 'data_operator')
    .order('enrolled_at', { ascending: false });
  if (error) return fail(res, `Could not load users: ${error.message}`, 500);

  return ok(res, {
    users: (data || []).map((u) => ({
      userId: u.user_id,
      docketNumber: u.docket_number,
      fullName: u.user_identity?.full_name || null,
      contactNumber: u.user_identity?.contact_number || null,
      address: u.user_identity?.address || null,
      caseType: u.case_types?.name || null,
      jurisdictionName: u.jurisdictions?.name || null,
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

module.exports = router;
