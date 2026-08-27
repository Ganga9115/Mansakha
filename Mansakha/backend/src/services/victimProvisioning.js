const bcrypt = require('bcrypt');
const { supabase } = require('../db/supabaseClient');
const { withTransaction } = require('../db/pgPool');

// 'Case Closed' is terminal, settable only by Data Operator (routes/dataIntake.js) -
// District Admin's case_stage edits (routes/admin.js) stay restricted to the
// original 4, enforced below via updateVictim's `canCloseCase` flag.
const CASE_STAGES_OPEN = ['Investigation', 'Trial', 'Rehabilitation', 'Compensation'];
const VALID_CASE_STAGES = [...CASE_STAGES_OPEN, 'Case Closed'];
const VALID_STATUSES = ['active', 'inactive'];

// Automated counsellor-assignment scoring (services/stressResponse.js) - each
// case stage's point value. 'Case Closed' scores 0 so a closed case never
// distorts the tie-break sum, and doesn't need excluding from it separately.
const CASE_STAGE_SCORES = {
  Investigation: 1,
  Trial: 2,
  Rehabilitation: 3,
  Compensation: 4,
  'Case Closed': 0,
};
// Every victim's password on creation - fixed, not admin-chosen, per explicit
// request. must_change_password (default true) forces a real one on first
// login (routes/auth.victim.js), same pattern as officials.
const DEFAULT_VICTIM_PASSWORD = 'Victim123';

// Every table with a victim_id foreign key into victims (besides victim_identity,
// which is the record's own PII row and gets deleted alongside it, not treated
// as "history"). Checked up front by deleteVictim so a delete either fully
// succeeds or leaves nothing changed - see the transaction there.
const VICTIM_HISTORY_TABLES = [
  ['distress_scores', 'victim_id'],
  ['consent_records', 'victim_id'],
  ['interactions', 'victim_id'],
  ['alerts', 'victim_id'],
  ['interventions', 'victim_id'],
  ['audit_log', 'victim_id'],
  ['case_notes', 'victim_id'],
  ['dispatch_queue', 'victim_id'],
  ['chat_messages', 'victim_id'],
  ['messages', 'victim_id'],
  ['sos_events', 'victim_id'],
  ['journal_entries', 'victim_id'],
  ['counselling_sessions', 'victim_id'],
];

class ProvisioningError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

// Shared by routes/admin.js's District Admin victim-creation route (jurisdiction-
// locked to the caller's own district via requireJurisdiction) and
// routes/dataIntake.js's Data Operator equivalent (not jurisdiction-locked,
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

  // victims + victim_identity in one transaction - a victim row must never exist
  // without its identity row (or vice versa); two independent supabase-js calls
  // could previously leave an orphaned victims row if the second insert failed.
  let victimId;
  try {
    victimId = await withTransaction(async (client) => {
      const { rows } = await client.query(
        `insert into victims (docket_number, case_type_id, jurisdiction_id, case_stage, auth_method, case_background, password_hash, must_change_password)
         values ($1, $2, $3, $4, $5, $6, $7, true)
         returning victim_id`,
        [docketNumber.trim(), caseTypeId, jurisdictionId, resolvedCaseStage, provisionedVia, caseBackground || null, passwordHash]
      );
      const id = rows[0].victim_id;
      await client.query(
        `insert into victim_identity (victim_id, full_name, contact_number, address) values ($1, $2, $3, $4)`,
        [id, fullName.trim(), contactNumber.trim(), address || null]
      );
      return id;
    });
  } catch (err) {
    throw new ProvisioningError(`Could not create victim: ${err.message}`, 500);
  }

  // temporaryPassword returned so the calling route can show it to the
  // provisioning admin alongside the docket number - it's the same fixed
  // value every time, but the admin still needs to actually tell the victim.
  return { victimId, docketNumber: docketNumber.trim(), temporaryPassword: DEFAULT_VICTIM_PASSWORD };
}

// Case stage / status / contact detail updates only - docket number, name, and
// jurisdiction are the login credential and stay immutable here (changing
// them would lock the victim out or move them into someone else's
// jurisdiction scope without a deliberate transfer flow).
//
// canCloseCase: District Admin's route (routes/admin.js) always passes false
// (case_stage stays restricted to the 4 open stages there); Data Operator's
// route (routes/dataIntake.js) passes true - marking a case closed is
// explicitly a Data Operator action, per request.
async function updateVictim(victimId, { caseStage, status, address, contactNumber }, { canCloseCase = false } = {}) {
  if (caseStage === undefined && status === undefined && address === undefined && contactNumber === undefined) {
    throw new ProvisioningError('caseStage, status, address, or contactNumber is required', 400);
  }
  if (caseStage !== undefined) {
    const allowedStages = canCloseCase ? VALID_CASE_STAGES : CASE_STAGES_OPEN;
    if (!allowedStages.includes(caseStage)) {
      throw new ProvisioningError(
        canCloseCase
          ? `caseStage must be one of: ${VALID_CASE_STAGES.join(', ')}`
          : `caseStage must be one of: ${CASE_STAGES_OPEN.join(', ')} (only Data Operator can mark a case closed)`,
        canCloseCase ? 400 : 403
      );
    }
  }
  if (status !== undefined && !VALID_STATUSES.includes(status)) {
    throw new ProvisioningError(`status must be one of: ${VALID_STATUSES.join(', ')}`, 400);
  }

  // Both patches (when both are present) run in one transaction - a caller that
  // sends caseStage/status alongside address/contactNumber must not end up with
  // only one side applied if the other fails.
  try {
    await withTransaction(async (client) => {
      if (caseStage !== undefined || status !== undefined) {
        const sets = [];
        const values = [];
        if (caseStage !== undefined) { values.push(caseStage); sets.push(`case_stage = $${values.length}`); }
        if (status !== undefined) { values.push(status); sets.push(`status = $${values.length}`); }
        values.push(victimId);
        await client.query(`update victims set ${sets.join(', ')} where victim_id = $${values.length}`, values);
      }

      if (address !== undefined || contactNumber !== undefined) {
        const sets = [];
        const values = [];
        if (address !== undefined) { values.push(address || null); sets.push(`address = $${values.length}`); }
        if (contactNumber !== undefined) { values.push(contactNumber || null); sets.push(`contact_number = $${values.length}`); }
        values.push(victimId);
        await client.query(`update victim_identity set ${sets.join(', ')} where victim_id = $${values.length}`, values);
      }
    });
  } catch (err) {
    throw new ProvisioningError(`Could not update victim: ${err.message}`, 500);
  }
}

// Hard delete - only actually succeeds for a victim with no case history yet
// (no row in any of the tables above). Everything (the history check, the
// victim_identity delete, and the victims delete) runs in one transaction:
// previously these were two separate supabase-js calls, so a victim_id delete
// failing (FK violation, real history) AFTER the victim_identity delete had
// already succeeded permanently destroyed that victim's name/contact/address
// while leaving the case record behind with no way to re-attach them. Wrapping
// both in a transaction means any failure rolls back everything, not just the
// second half.
async function deleteVictim(victimId) {
  try {
    await withTransaction(async (client) => {
      for (const [table, column] of VICTIM_HISTORY_TABLES) {
        const { rows } = await client.query(`select 1 from ${table} where ${column} = $1 limit 1`, [victimId]);
        if (rows.length) {
          throw new ProvisioningError('This victim has case history and cannot be deleted - mark the case inactive instead.', 409);
        }
      }

      await client.query('delete from victim_identity where victim_id = $1', [victimId]);
      const { rowCount } = await client.query('delete from victims where victim_id = $1', [victimId]);
      if (!rowCount) throw new ProvisioningError('Victim not found', 404);
    });
  } catch (err) {
    if (err instanceof ProvisioningError) throw err;
    // A concurrent write could still slip a new history row in between the
    // check above and the delete - the transaction rolls back cleanly either
    // way, so this is just a clear message instead of a raw FK error.
    throw new ProvisioningError('This victim has related records and cannot be deleted - mark the case inactive instead.', 409);
  }
}

module.exports = {
  createVictim, updateVictim, deleteVictim, ProvisioningError,
  VALID_CASE_STAGES, CASE_STAGES_OPEN, VALID_STATUSES, CASE_STAGE_SCORES,
};
