const express = require('express');
const { supabase } = require('../db/supabaseClient');
const { verifyToken } = require('../middleware/verifyToken');
const { requireRole } = require('../middleware/requireRole');
const { generalApiLimiter } = require('../middleware/rateLimiter');
const { ok, fail } = require('../services/responseEnvelope');
const { createVictim, updateVictim, deleteVictim, ProvisioningError } = require('../services/victimProvisioning');
const { writeAuditLog } = require('../services/auditLog');

const router = express.Router();

router.use(verifyToken, requireRole(['Data Operator']), generalApiLimiter);

// Feature Catalog Section 7 - identical creation logic to District Admin's
// POST /api/admin/victims (services/victimProvisioning.js), but deliberately
// NOT jurisdiction-locked: Data Operator is framed as an integration/
// intake role that can register a victim into any district, not a
// district-operational one - so no requireJurisdiction here.
router.post('/register-victim', async (req, res) => {
  const { docketNumber, fullName, contactNumber, jurisdictionId, caseTypeId, caseStage, address, caseBackground } = req.body;
  try {
    const { victimId } = await createVictim({
      docketNumber, fullName, contactNumber, jurisdictionId, caseTypeId, caseStage, address, caseBackground,
      provisionedVia: 'data_intake_admin',
    });
    await writeAuditLog({ officialId: req.auth.officialId, victimId, action: 'create', entityType: 'victim', entityId: victimId });
    return ok(res, { victimId, docketNumber }, 'Victim record created', 201);
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

// New "Victims" sidebar feature - every victim created via this Data
// Operator flow (auth_method = 'data_intake_admin'), not scoped to the specific
// official who created it - Data Operator isn't jurisdiction- or
// creator-scoped anywhere else either (Section 7), so this stays consistent
// with that. Full detail (identity + case + jurisdiction), not just the
// truncated fields Counsellor's case queue shows.
router.get('/victims', async (req, res) => {
  const { data, error } = await supabase
    .from('victims')
    .select(`
      victim_id, docket_number, case_stage, status, case_background, enrolled_at,
      case_types(name),
      jurisdictions(name),
      victim_identity(full_name, contact_number, address)
    `)
    .eq('auth_method', 'data_intake_admin')
    .order('enrolled_at', { ascending: false });
  if (error) return fail(res, `Could not load victims: ${error.message}`, 500);

  return ok(res, {
    victims: (data || []).map((v) => ({
      victimId: v.victim_id,
      docketNumber: v.docket_number,
      fullName: v.victim_identity?.full_name || null,
      contactNumber: v.victim_identity?.contact_number || null,
      address: v.victim_identity?.address || null,
      caseType: v.case_types?.name || null,
      jurisdictionName: v.jurisdictions?.name || null,
      caseStage: v.case_stage,
      status: v.status,
      caseBackground: v.case_background,
      enrolledAt: v.enrolled_at,
    })),
  });
});

router.patch('/victims/:victimId', async (req, res) => {
  const { victimId } = req.params;
  const { caseStage, status, address, contactNumber } = req.body;
  try {
    await updateVictim(victimId, { caseStage, status, address, contactNumber });
    await writeAuditLog({ officialId: req.auth.officialId, victimId, action: 'update', entityType: 'victim', entityId: victimId });
    return ok(res, null, 'Victim record updated');
  } catch (err) {
    if (err instanceof ProvisioningError) return fail(res, err.message, err.status);
    throw err;
  }
});

router.delete('/victims/:victimId', async (req, res) => {
  const { victimId } = req.params;
  try {
    await deleteVictim(victimId);
    await writeAuditLog({ officialId: req.auth.officialId, victimId, action: 'delete', entityType: 'victim', entityId: victimId });
    return ok(res, null, 'Victim record deleted');
  } catch (err) {
    if (err instanceof ProvisioningError) return fail(res, err.message, err.status);
    throw err;
  }
});

module.exports = router;
