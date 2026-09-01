const express = require('express');
const { supabase } = require('../../core/db/supabaseClient');
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
      provisionedVia: 'data_intake_admin',
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
router.post('/fetch-case', async (req, res) => {
  const { docketNumber } = req.body;
  if (!docketNumber) return fail(res, 'docketNumber is required', 400);

  // Deterministic fixture derived from the input, not random - so the same
  // docket number always "fetches" the same plausible-looking result during
  // a demo, without pretending to hit a real backing system.
  const seed = String(docketNumber).split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  const stages = ['Investigation', 'Trial', 'Rehabilitation', 'Compensation'];
  const caseTypes = ['Rape / Gang Rape', 'Murder / Grievous Hurt / Arson', 'Witness Facing Intimidation or Threats', 'Family Affected by Caste-Based Violence'];

  await writeAuditLog({ officialId: req.auth.officialId, action: 'read', entityType: 'simulated_case_fetch' });

  return ok(res, {
    simulated: true,
    docketNumber,
    suggestedCaseType: caseTypes[seed % caseTypes.length],
    suggestedCaseStage: stages[seed % stages.length],
    note: 'Simulated data - placeholder for a real NHAA/Integrated Portal API integration that does not exist yet. Not a live government record.',
  });
});

// "Users" sidebar feature - every user created via this Data
// Operator flow (auth_method = 'data_intake_admin'), not scoped to the specific
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
    .eq('auth_method', 'data_intake_admin')
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
