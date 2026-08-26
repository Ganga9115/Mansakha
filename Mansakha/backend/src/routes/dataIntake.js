const express = require('express');
const { verifyToken } = require('../middleware/verifyToken');
const { requireRole } = require('../middleware/requireRole');
const { generalApiLimiter } = require('../middleware/rateLimiter');
const { ok, fail } = require('../services/responseEnvelope');
const { createVictim, ProvisioningError } = require('../services/victimProvisioning');
const { writeAuditLog } = require('../services/auditLog');

const router = express.Router();

router.use(verifyToken, requireRole(['Data Intake Admin']), generalApiLimiter);

// Feature Catalog Section 7 - identical creation logic to District Admin's
// POST /api/admin/victims (services/victimProvisioning.js), but deliberately
// NOT jurisdiction-locked: Data Intake Admin is framed as an integration/
// intake role that can register a victim into any district, not a
// district-operational one - so no requireJurisdiction here.
router.post('/register-victim', async (req, res) => {
  const { docketNumber, fullName, jurisdictionId, caseTypeId, caseStage, address, caseBackground } = req.body;
  try {
    const { victimId } = await createVictim({
      docketNumber, fullName, jurisdictionId, caseTypeId, caseStage, address, caseBackground,
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

module.exports = router;
