const bcrypt = require('bcrypt');
const { supabase } = require('../../core/db/supabaseClient');
const { withTransaction } = require('../../core/db/pgPool');

// 'Case Closed' is terminal, settable only by Data Operator (dataoperator/routes/dataoperator.routes.js) -
// District Admin's case_stage edits (district_admin/routes/districtAdmin.routes.js) stay restricted to the
// original 4, enforced below via updateUser's `canCloseCase` flag.
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
// Every user's password on creation - fixed, not admin-chosen, per explicit
// request. must_change_password (default true) forces a real one on first
// login (user/routes/auth.user.routes.js), same pattern as officials.
const DEFAULT_USER_PASSWORD = 'User123';

// Every table with a user_id foreign key into users (besides user_identity,
// which is the record's own PII row and gets deleted alongside it, not treated
// as "history"). Checked up front by deleteUser so a delete either fully
// succeeds or leaves nothing changed - see the transaction there.
const USER_HISTORY_TABLES = [
  ['distress_scores', 'user_id'],
  ['consent_records', 'user_id'],
  ['interactions', 'user_id'],
  ['alerts', 'user_id'],
  ['interventions', 'user_id'],
  ['audit_log', 'user_id'],
  ['case_notes', 'user_id'],
  ['dispatch_queue', 'user_id'],
  ['chat_messages', 'user_id'],
  ['messages', 'user_id'],
  ['sos_events', 'user_id'],
  ['journal_entries', 'user_id'],
  ['counselling_sessions', 'user_id'],
];

class ProvisioningError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

// Shared by District Admin's user-creation route (jurisdiction-
// locked to the caller's own district via requireJurisdiction) and
// Data Operator's equivalent (not jurisdiction-locked,
// per Feature Catalog Section 7) - both already-validated their own jurisdiction
// scope before calling this; it only performs the insert. This is the write-side
// counterpart to auth.user.routes.js's docket-based login (Section 1.1).
// caseStage is optional at creation (defaults to the first real stage,
// 'Investigation') - per explicit request, stage is something the operator
// sets later via the Users list's editable dropdown (PATCH .../users/:id
// below), not a decision made at intake time.
async function createUser({ docketNumber, fullName, contactNumber, jurisdictionId, caseTypeId, caseStage, provisionedVia, address = null, caseBackground = null, password = null }) {
  if (!docketNumber || !fullName || !contactNumber || !jurisdictionId || !caseTypeId) {
    throw new ProvisioningError('docketNumber, fullName, contactNumber, jurisdictionId, and caseTypeId are required', 400);
  }

  const normalizedContact = String(contactNumber).replace(/[^0-9]/g, '').slice(-10);
  if (normalizedContact.length !== 10) {
    throw new ProvisioningError('Contact number must be exactly 10 digits', 400);
  }

  const resolvedCaseStage = caseStage || VALID_CASE_STAGES[0];
  if (!VALID_CASE_STAGES.includes(resolvedCaseStage)) {
    throw new ProvisioningError(`caseStage must be one of: ${VALID_CASE_STAGES.join(', ')}`, 400);
  }

  const { data: existing } = await supabase.from('users').select('user_id').eq('docket_number', docketNumber.trim()).maybeSingle();
  if (existing) throw new ProvisioningError('A user with this docket number already exists', 409);

  const initialPassword = (password && String(password).trim()) ? String(password).trim() : DEFAULT_USER_PASSWORD;
  const passwordHash = await bcrypt.hash(initialPassword, 12);

  // users + user_identity in one transaction - a user row must never exist
  // without its identity row (or vice versa); two independent supabase-js calls
  // could previously leave an orphaned users row if the second insert failed.
  let userId;
  try {
    userId = await withTransaction(async (client) => {
      const { rows } = await client.query(
        `insert into users (docket_number, case_type_id, jurisdiction_id, case_stage, auth_method, case_background, password_hash, must_change_password)
         values ($1, $2, $3, $4, $5, $6, $7, true)
         returning user_id`,
        [docketNumber.trim(), caseTypeId, jurisdictionId, resolvedCaseStage, provisionedVia, caseBackground || null, passwordHash]
      );
      const id = rows[0].user_id;
      await client.query(
        `insert into user_identity (user_id, full_name, contact_number, address) values ($1, $2, $3, $4)`,
        [id, fullName.trim(), normalizedContact, address || null]
      );
      return id;
    });
  } catch (err) {
    throw new ProvisioningError(`Could not create user: ${err.message}`, 500);
  }

  return { userId, docketNumber: docketNumber.trim(), temporaryPassword: initialPassword };
}

// Case stage / status / contact detail updates only - docket number, name, and
// jurisdiction are the login credential and stay immutable here (changing
// them would lock the user out or move them into someone else's
// jurisdiction scope without a deliberate transfer flow).
//
// canCloseCase: District Admin's route (district_admin/routes/districtAdmin.routes.js) always passes false
// (case_stage stays restricted to the 4 open stages there); Data Operator's
// route (dataoperator/routes/dataoperator.routes.js) passes true - marking a case closed is
// explicitly a Data Operator action, per request.
async function updateUser(userId, { caseStage, status, address, contactNumber }, { canCloseCase = false } = {}) {
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
        values.push(userId);
        await client.query(`update users set ${sets.join(', ')} where user_id = $${values.length}`, values);
      }

      if (address !== undefined || contactNumber !== undefined) {
        const sets = [];
        const values = [];
        if (address !== undefined) { values.push(address || null); sets.push(`address = $${values.length}`); }
        if (contactNumber !== undefined) { values.push(contactNumber || null); sets.push(`contact_number = $${values.length}`); }
        values.push(userId);
        await client.query(`update user_identity set ${sets.join(', ')} where user_id = $${values.length}`, values);
      }
    });
  } catch (err) {
    throw new ProvisioningError(`Could not update user: ${err.message}`, 500);
  }
}

// Hard delete - only actually succeeds for a user with no case history yet
// (no row in any of the tables above). Everything (the history check, the
// user_identity delete, and the users delete) runs in one transaction:
// previously these were two separate supabase-js calls, so a user_id delete
// failing (FK violation, real history) AFTER the user_identity delete had
// already succeeded permanently destroyed that user's name/contact/address
// while leaving the case record behind with no way to re-attach them. Wrapping
// both in a transaction means any failure rolls back everything, not just the
// second half.
async function deleteUser(userId) {
  try {
    await withTransaction(async (client) => {
      for (const [table, column] of USER_HISTORY_TABLES) {
        const { rows } = await client.query(`select 1 from ${table} where ${column} = $1 limit 1`, [userId]);
        if (rows.length) {
          throw new ProvisioningError('This user has case history and cannot be deleted - mark the case inactive instead.', 409);
        }
      }

      await client.query('delete from user_identity where user_id = $1', [userId]);
      const { rowCount } = await client.query('delete from users where user_id = $1', [userId]);
      if (!rowCount) throw new ProvisioningError('User not found', 404);
    });
  } catch (err) {
    if (err instanceof ProvisioningError) throw err;
    // A concurrent write could still slip a new history row in between the
    // check above and the delete - the transaction rolls back cleanly either
    // way, so this is just a clear message instead of a raw FK error.
    throw new ProvisioningError('This user has related records and cannot be deleted - mark the case inactive instead.', 409);
  }
}

module.exports = {
  createUser, updateUser, deleteUser, ProvisioningError,
  VALID_CASE_STAGES, CASE_STAGES_OPEN, VALID_STATUSES, CASE_STAGE_SCORES,
};
