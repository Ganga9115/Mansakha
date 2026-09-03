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
  ['alert_notifications', 'user_id'],
  ['interventions', 'user_id'],
  ['audit_log', 'user_id'],
  ['case_notes', 'user_id'],
  ['dispatch_queue', 'user_id'],
  ['chat_messages', 'user_id'],
  ['messages', 'user_id'],
  ['sos_events', 'user_id'],
  ['journal_entries', 'user_id'],
  ['counselling_sessions', 'user_id'],
  ['typing_status', 'user_id'],
  ['user_questionnaires', 'user_id'],
];

// The three tables that make up a case's own "activity" for multi-case
// linking purposes (see linkExistingCase below) - deliberately the same set
// the staff-facing anchor-resolution fix (counsellor/admin routes) reads
// from, since those are exactly the tables that would become unreachable
// through the app once a case is made dependent.
const CASE_ACTIVITY_TABLES = ['distress_scores', 'interactions', 'messages'];

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
async function createUser({ docketNumber, fullName, contactNumber, jurisdictionId, caseTypeId, caseStage, provisionedVia, address = null, caseBackground = null, password = null, aadhaarNumber = null }) {
  if (!docketNumber || !fullName || !contactNumber || !jurisdictionId || !caseTypeId) {
    throw new ProvisioningError('docketNumber, fullName, contactNumber, jurisdictionId, and caseTypeId are required', 400);
  }

  const normalizedContact = String(contactNumber).replace(/[^0-9]/g, '').slice(-10);
  if (normalizedContact.length !== 10) {
    throw new ProvisioningError('Contact number must be exactly 10 digits', 400);
  }
  // Blank stored as null, not '' - user_identity.aadhaar_number is UNIQUE, and
  // two blank strings would collide under that constraint where two NULLs
  // would not.
  const normalizedAadhaar = aadhaarNumber && String(aadhaarNumber).trim() ? String(aadhaarNumber).trim() : null;

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
        `insert into user_identity (user_id, full_name, contact_number, address, aadhaar_number) values ($1, $2, $3, $4, $5)`,
        [id, fullName.trim(), normalizedContact, address || null, normalizedAadhaar]
      );
      return id;
    });
  } catch (err) {
    // Someone else's case already has this Aadhaar number - a real match,
    // not a random collision, since it's a 1:1 identity field. Surfaced as a
    // clear 409 (rather than a raw constraint-violation message) so the
    // Fetch Case/Register User frontend can offer "link instead" as the
    // resolution, matching the multi-case-per-person design.
    if (err.code === '23505' && err.constraint === 'user_identity_aadhaar_number_key') {
      throw new ProvisioningError('This Aadhaar number already belongs to an existing case - link this case to that person instead of creating a new one.', 409);
    }
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
        // A dependent case has no user_identity row of its own (it inherits
        // the anchor's - see createLinkedCase below) - updating by the
        // literal userId here would silently affect zero rows for one,
        // discarding the edit with no error. Resolved to the anchor first.
        const { rows: linkRows } = await client.query('select linked_to_user_id from users where user_id = $1', [userId]);
        const identityUserId = linkRows[0]?.linked_to_user_id || userId;

        const sets = [];
        const values = [];
        if (address !== undefined) { values.push(address || null); sets.push(`address = $${values.length}`); }
        if (contactNumber !== undefined) { values.push(contactNumber || null); sets.push(`contact_number = $${values.length}`); }
        values.push(identityUserId);
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
      // A dependent case's identity/session/counsellor all resolve through
      // this row (see linkExistingCase/createLinkedCase below) - deleting it
      // out from under them would leave every linked docket pointing at a
      // user_id that no longer exists.
      const { rows: dependents } = await client.query('select 1 from users where linked_to_user_id = $1 limit 1', [userId]);
      if (dependents.length) {
        throw new ProvisioningError('This case has other cases linked to it and cannot be deleted - unlink them first.', 409);
      }

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

// Multi-Case-Per-Person Support - links an already-registered, still-unused
// case (userId) to an existing person's case (linkToUserId), so both share
// one identity/session/counsellor going forward (see auth.user.routes.js's
// login for how a "dependent" row's linked_to_user_id gets resolved). Kept
// deliberately narrow: this is for the "these two docket numbers turned out
// to be the same person" cleanup case, not a general history-merge tool -
// see the three rejection conditions below.
async function linkExistingCase(userId, linkToUserId) {
  if (userId === linkToUserId) {
    throw new ProvisioningError('A case cannot be linked to itself', 400);
  }

  const { data: rows, error } = await supabase
    .from('users')
    .select('user_id, linked_to_user_id')
    .in('user_id', [userId, linkToUserId]);
  if (error || !rows || rows.length !== 2) {
    throw new ProvisioningError('One or both cases could not be found', 404);
  }
  const sourceRow = rows.find((r) => r.user_id === userId);
  const targetRow = rows.find((r) => r.user_id === linkToUserId);
  const anchorUserId = targetRow.linked_to_user_id || targetRow.user_id;
  if (anchorUserId === userId) {
    throw new ProvisioningError('A case cannot be linked to itself', 400);
  }

  // Rejection 1: userId is already linked to someone. Re-pointing an
  // existing link to a different anchor is a "move", not something this
  // flow was built for - blocking is the safe default.
  if (sourceRow.linked_to_user_id) {
    throw new ProvisioningError('This case is already linked to another person', 409);
  }

  // Rejection 2: userId is itself already an anchor with its own dependents.
  // Making an anchor into someone else's dependent would either orphan its
  // dependents (they'd still point at userId, not the new anchor) or require
  // re-pointing them too (a real family-merge, out of scope) - either way it
  // breaks the flat, 2-level structure this design relies on.
  const { data: sourceDependents } = await supabase.from('users').select('user_id').eq('linked_to_user_id', userId).limit(1);
  if (sourceDependents && sourceDependents.length > 0) {
    throw new ProvisioningError('This case already has other cases linked to it - link the other case(s) to the target person individually instead.', 409);
  }

  // Rejection 3: userId already has real activity of its own. Once linked,
  // distress_scores/interactions/messages are read via the ANCHOR's user_id
  // everywhere staff-facing (see counsellor.routes.js's activity-resolution
  // fix) - userId's own real history would become permanently unreachable
  // through the app, silently orphaned.
  for (const table of CASE_ACTIVITY_TABLES) {
    const { data: activityRows } = await supabase.from(table).select('user_id').eq('user_id', userId).limit(1);
    if (activityRows && activityRows.length > 0) {
      throw new ProvisioningError("This case already has activity of its own and can't be linked - only a case with no activity yet can be merged into another person.", 409);
    }
  }

  const { data: anchor } = await supabase
    .from('users')
    .select('assigned_counsellor_id, opted_for_manual_counsellor')
    .eq('user_id', anchorUserId)
    .maybeSingle();

  const { error: updateError } = await supabase
    .from('users')
    .update({
      linked_to_user_id: anchorUserId,
      assigned_counsellor_id: anchor?.assigned_counsellor_id || null,
      opted_for_manual_counsellor: anchor?.opted_for_manual_counsellor || false,
    })
    .eq('user_id', userId);
  if (updateError) throw new ProvisioningError(`Could not link case: ${updateError.message}`, 500);

  return { anchorUserId };
}

// Registers a brand-new case that's already known to belong to an existing
// person (Data Operator's "Link Cases" flow - a fresh docket that came back
// with a Fetch Case Aadhaar match, or a deliberate "add another case for
// this person" action). No user_identity row is created here - a dependent
// case inherits the anchor's identity - and it starts with its own default
// temp password/must_change_password, exactly like createUser, since there's
// no way to know the person's real password from here (see auth.user.routes.js's
// login mechanics for how that first login and password change resolve).
async function createLinkedCase({ docketNumber, caseTypeId, jurisdictionId, caseStage, caseBackground = null, linkToUserId, provisionedVia }) {
  if (!docketNumber || !caseTypeId || !jurisdictionId || !linkToUserId) {
    throw new ProvisioningError('docketNumber, caseTypeId, jurisdictionId, and linkToUserId are required', 400);
  }

  const resolvedCaseStage = caseStage || VALID_CASE_STAGES[0];
  if (!VALID_CASE_STAGES.includes(resolvedCaseStage)) {
    throw new ProvisioningError(`caseStage must be one of: ${VALID_CASE_STAGES.join(', ')}`, 400);
  }

  const { data: existing } = await supabase.from('users').select('user_id').eq('docket_number', docketNumber.trim()).maybeSingle();
  if (existing) throw new ProvisioningError('A user with this docket number already exists', 409);

  const { data: targetRow, error: targetError } = await supabase
    .from('users')
    .select('user_id, linked_to_user_id, assigned_counsellor_id, opted_for_manual_counsellor')
    .eq('user_id', linkToUserId)
    .maybeSingle();
  if (targetError || !targetRow) throw new ProvisioningError('The person to link this case to could not be found', 404);

  const anchorUserId = targetRow.linked_to_user_id || targetRow.user_id;
  let anchorAssignment = targetRow;
  if (targetRow.linked_to_user_id) {
    const { data: anchor } = await supabase
      .from('users')
      .select('assigned_counsellor_id, opted_for_manual_counsellor')
      .eq('user_id', anchorUserId)
      .maybeSingle();
    anchorAssignment = anchor || {};
  }

  const passwordHash = await bcrypt.hash(DEFAULT_USER_PASSWORD, 12);

  let userId;
  try {
    userId = await withTransaction(async (client) => {
      const { rows } = await client.query(
        `insert into users (docket_number, case_type_id, jurisdiction_id, case_stage, auth_method, case_background, password_hash, must_change_password, linked_to_user_id, assigned_counsellor_id, opted_for_manual_counsellor)
         values ($1, $2, $3, $4, $5, $6, $7, true, $8, $9, $10)
         returning user_id`,
        [
          docketNumber.trim(), caseTypeId, jurisdictionId, resolvedCaseStage, provisionedVia, caseBackground || null, passwordHash,
          anchorUserId, anchorAssignment?.assigned_counsellor_id || null, anchorAssignment?.opted_for_manual_counsellor || false,
        ]
      );
      return rows[0].user_id;
    });
  } catch (err) {
    throw new ProvisioningError(`Could not create linked case: ${err.message}`, 500);
  }

  return { userId, docketNumber: docketNumber.trim(), temporaryPassword: DEFAULT_USER_PASSWORD, anchorUserId };
}

// Keeps assigned_counsellor_id/opted_for_manual_counsellor in sync across an
// entire case family in one statement, called from every site that assigns a
// counsellor or changes the manual-counsellor opt-in (stressResponse.js's
// applyStressResponse, user.routes.js's PATCH /counsellor-preference,
// GET /assigned-counsellor, and POST /urgent-help's lazy assignment) instead
// of each doing its own single-row update. Both fields travel together
// deliberately - opted_for_manual_counsellor is read per-case-row by staff
// (Case Detail's badge, counsellor.routes.js's requireOptedInUser chat gate),
// so propagating the counsellor without the opt-in flag would leave a
// dependent case showing "opted for manual: No" and unable to open chat with
// the very counsellor it's now assigned to.
async function propagateCounsellorAssignment(anchorUserId, { counsellorId, optedForManual } = {}) {
  const patch = {};
  if (counsellorId !== undefined) patch.assigned_counsellor_id = counsellorId;
  if (optedForManual !== undefined) patch.opted_for_manual_counsellor = optedForManual;
  if (Object.keys(patch).length === 0) return;

  const { error } = await supabase
    .from('users')
    .update(patch)
    .or(`user_id.eq.${anchorUserId},linked_to_user_id.eq.${anchorUserId}`);
  if (error) throw new Error(`Could not propagate counsellor assignment: ${error.message}`);
}

module.exports = {
  createUser, updateUser, deleteUser, linkExistingCase, createLinkedCase, propagateCounsellorAssignment, ProvisioningError,
  VALID_CASE_STAGES, CASE_STAGES_OPEN, VALID_STATUSES, CASE_STAGE_SCORES,
};
