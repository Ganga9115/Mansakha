const bcrypt = require('bcrypt');
const { supabase } = require('../db/supabaseClient');

const VALID_CASE_STAGES = ['Investigation', 'Trial', 'Rehabilitation', 'Compensation'];
const VALID_STATUSES = ['active', 'inactive'];
// Every victim's password on creation - fixed, not admin-chosen, per explicit
// request. must_change_password (default true) forces a real one on first
// login (routes/auth.victim.js), same pattern as officials.
const DEFAULT_VICTIM_PASSWORD = 'Victim123';

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
// caseStage is optional at creation (defaults to the first real stage,
// 'Investigation') - per explicit request, stage is something the operator
// sets later via the Victims list's editable dropdown (PATCH .../victims/:id
// below), not a decision made at intake time.
async function createVictim({ docketNumber, fullName, contactNumber, jurisdictionId, caseTypeId, caseStage, provisionedVia, address = null, caseBackground = null }) {
  if (!docketNumber || !fullName || !contactNumber || !jurisdictionId || !caseTypeId) {
    throw new ProvisioningError('docketNumber, fullName, contactNumber, jurisdictionId, and caseTypeId are required', 400);
  }
  const resolvedCaseStage = caseStage || VALID_CASE_STAGES[0];
  if (!VALID_CASE_STAGES.includes(resolvedCaseStage)) {
    throw new ProvisioningError(`caseStage must be one of: ${VALID_CASE_STAGES.join(', ')}`, 400);
  }

  const { data: existing } = await supabase.from('victims').select('victim_id').eq('docket_number', docketNumber.trim()).maybeSingle();
  if (existing) throw new ProvisioningError('A victim with this docket number already exists', 409);

  const passwordHash = await bcrypt.hash(DEFAULT_VICTIM_PASSWORD, 12);

  const { data: victim, error: victimError } = await supabase
    .from('victims')
    .insert({
      docket_number: docketNumber.trim(),
      case_type_id: caseTypeId,
      jurisdiction_id: jurisdictionId,
      case_stage: resolvedCaseStage,
      auth_method: provisionedVia, // 'district_admin' | 'data_intake_admin'
      case_background: caseBackground || null,
      password_hash: passwordHash,
      must_change_password: true,
    })
    .select('victim_id')
    .single();
  if (victimError) throw new ProvisioningError(`Could not create victim: ${victimError.message}`, 500);

  const { error: identityError } = await supabase.from('victim_identity').insert({
    victim_id: victim.victim_id,
    full_name: fullName.trim(),
    contact_number: contactNumber.trim(),
    address: address || null,
  });
  if (identityError) throw new ProvisioningError(`Could not create victim identity: ${identityError.message}`, 500);

  // temporaryPassword returned so the calling route can show it to the
  // provisioning admin alongside the docket number - it's the same fixed
  // value every time, but the admin still needs to actually tell the victim.
  return { victimId: victim.victim_id, docketNumber: docketNumber.trim(), temporaryPassword: DEFAULT_VICTIM_PASSWORD };
}

// Case stage / status / contact detail updates only - docket number, name, and
// jurisdiction are the login credential and stay immutable here (changing
// them would lock the victim out or move them into someone else's
// jurisdiction scope without a deliberate transfer flow).
async function updateVictim(victimId, { caseStage, status, address, contactNumber }) {
  if (caseStage === undefined && status === undefined && address === undefined && contactNumber === undefined) {
    throw new ProvisioningError('caseStage, status, address, or contactNumber is required', 400);
  }
  if (caseStage !== undefined && !VALID_CASE_STAGES.includes(caseStage)) {
    throw new ProvisioningError(`caseStage must be one of: ${VALID_CASE_STAGES.join(', ')}`, 400);
  }
  if (status !== undefined && !VALID_STATUSES.includes(status)) {
    throw new ProvisioningError(`status must be one of: ${VALID_STATUSES.join(', ')}`, 400);
  }

  if (caseStage !== undefined || status !== undefined) {
    const patch = {};
    if (caseStage !== undefined) patch.case_stage = caseStage;
    if (status !== undefined) patch.status = status;
    const { error } = await supabase.from('victims').update(patch).eq('victim_id', victimId);
    if (error) throw new ProvisioningError(`Could not update case: ${error.message}`, 500);
  }

  if (address !== undefined || contactNumber !== undefined) {
    const patch = {};
    if (address !== undefined) patch.address = address || null;
    if (contactNumber !== undefined) patch.contact_number = contactNumber || null;
    const { error } = await supabase.from('victim_identity').update(patch).eq('victim_id', victimId);
    if (error) throw new ProvisioningError(`Could not update contact details: ${error.message}`, 500);
  }
}

// Hard delete - only actually succeeds for a victim with no case history yet
// (no FK-referencing row in any of the 14 dependent tables: interactions,
// distress_scores, alerts, interventions, etc. - none of them cascade on
// delete, by design, same reasoning as officials never being hard-deleted).
// A victim with real history throws a clear, catchable error instead of a
// raw Postgres FK-violation message - the caller (routes/dataIntake.js) is
// expected to suggest marking the case inactive instead in that case.
async function deleteVictim(victimId) {
  const { error: identityError } = await supabase.from('victim_identity').delete().eq('victim_id', victimId);
  if (identityError) {
    throw new ProvisioningError('This victim has related records and cannot be deleted - mark the case inactive instead.', 409);
  }

  const { error: victimError } = await supabase.from('victims').delete().eq('victim_id', victimId);
  if (victimError) {
    throw new ProvisioningError('This victim has case history and cannot be deleted - mark the case inactive instead.', 409);
  }
}

module.exports = { createVictim, updateVictim, deleteVictim, ProvisioningError, VALID_CASE_STAGES, VALID_STATUSES };
