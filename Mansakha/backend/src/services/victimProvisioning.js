const { supabase } = require('../db/supabaseClient');

const VALID_CASE_STAGES = ['Investigation', 'Trial', 'Rehabilitation', 'Compensation'];

class ProvisioningError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

// Shared by routes/admin.js's District Admin victim-creation route (jurisdiction-
// locked to the caller's own district via requireJurisdiction) and
// routes/dataIntake.js's Data Intake Admin equivalent (not jurisdiction-locked,
// per Feature Catalog Section 7) - both already-validated their own jurisdiction
// scope before calling this; it only performs the insert. This is the write-side
// counterpart to auth.victim.js's docket-based login (Section 1.1).
async function createVictim({ docketNumber, fullName, jurisdictionId, caseTypeId, caseStage, provisionedVia, address = null, caseBackground = null }) {
  if (!docketNumber || !fullName || !jurisdictionId || !caseTypeId || !caseStage) {
    throw new ProvisioningError('docketNumber, fullName, jurisdictionId, caseTypeId, and caseStage are required', 400);
  }
  if (!VALID_CASE_STAGES.includes(caseStage)) {
    throw new ProvisioningError(`caseStage must be one of: ${VALID_CASE_STAGES.join(', ')}`, 400);
  }

  const { data: existing } = await supabase.from('victims').select('victim_id').eq('docket_number', docketNumber.trim()).maybeSingle();
  if (existing) throw new ProvisioningError('A victim with this docket number already exists', 409);

  const { data: victim, error: victimError } = await supabase
    .from('victims')
    .insert({
      docket_number: docketNumber.trim(),
      case_type_id: caseTypeId,
      jurisdiction_id: jurisdictionId,
      case_stage: caseStage,
      auth_method: provisionedVia, // 'district_admin' | 'data_intake_admin'
      case_background: caseBackground || null,
    })
    .select('victim_id')
    .single();
  if (victimError) throw new ProvisioningError(`Could not create victim: ${victimError.message}`, 500);

  const { error: identityError } = await supabase.from('victim_identity').insert({
    victim_id: victim.victim_id,
    full_name: fullName.trim(),
    address: address || null,
  });
  if (identityError) throw new ProvisioningError(`Could not create victim identity: ${identityError.message}`, 500);

  return { victimId: victim.victim_id, docketNumber: docketNumber.trim() };
}

// Case stage / contact detail updates only - docket number, name, and
// jurisdiction are the login credential and stay immutable here (changing
// them would lock the victim out or move them into someone else's
// jurisdiction scope without a deliberate transfer flow).
async function updateVictim(victimId, { caseStage, address, contactNumber }) {
  if (caseStage === undefined && address === undefined && contactNumber === undefined) {
    throw new ProvisioningError('caseStage, address, or contactNumber is required', 400);
  }
  if (caseStage !== undefined && !VALID_CASE_STAGES.includes(caseStage)) {
    throw new ProvisioningError(`caseStage must be one of: ${VALID_CASE_STAGES.join(', ')}`, 400);
  }

  if (caseStage !== undefined) {
    const { error } = await supabase.from('victims').update({ case_stage: caseStage }).eq('victim_id', victimId);
    if (error) throw new ProvisioningError(`Could not update case stage: ${error.message}`, 500);
  }

  if (address !== undefined || contactNumber !== undefined) {
    const patch = {};
    if (address !== undefined) patch.address = address || null;
    if (contactNumber !== undefined) patch.contact_number = contactNumber || null;
    const { error } = await supabase.from('victim_identity').update(patch).eq('victim_id', victimId);
    if (error) throw new ProvisioningError(`Could not update contact details: ${error.message}`, 500);
  }
}

module.exports = { createVictim, updateVictim, ProvisioningError, VALID_CASE_STAGES };
