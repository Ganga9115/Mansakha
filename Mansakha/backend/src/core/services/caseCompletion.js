const { pool } = require('../db/pgPool');
const { supabase } = require('../db/supabaseClient');
const { getRehabilitationStatus, isRehabilitationResolved } = require('./rehabilitationStatus');
const { writeAuditLog } = require('./auditLog');

// migration_045 - "user credentials should expire" once a case's own
// compensation is fully paid AND the person's (shared) rehabilitation
// question is resolved (declined outright, or opted-in-and-closed by the
// Rehabilitation Officer). Compensation stays genuinely per-case (a person
// with 2 dockets can have one fully paid and one not); rehabilitation is
// shared, so resolving it re-checks EVERY case under the same anchor at
// once, not just whichever case the triggering action happened to concern.
//
// Two-level effect, mirroring how case_stage === 'Case Closed' used to work
// per-docket while other dockets under the same person stayed usable:
//   1. Each individual case that now qualifies gets its own
//      case_completed_at stamped - that ONE docket stops being a usable
//      login credential (see auth.user.routes.js's own login check).
//   2. Only once EVERY case under the anchor is case_completed_at does the
//      anchor's own users.status flip to 'inactive' - a full account
//      deactivation, since there is then no case left that account could
//      ever legitimately need to log in for again.

function isCompensationComplete(compensationMetadata) {
  return !!compensationMetadata && Array.isArray(compensationMetadata.stages) && compensationMetadata.stages.length > 0
    && compensationMetadata.stages.every((s) => s.status === 'Paid');
}

// Called after any event that could newly satisfy the combined condition
// for one or more of a person's cases: a compensation stage marked Paid
// (pass just that case's own userId), or a rehabilitation decision changing
// (pass any userId under the anchor - every case under it is re-checked).
async function checkAndCompleteCasesForPerson(userId) {
  const rehabStatus = await getRehabilitationStatus(userId);
  if (!isRehabilitationResolved(rehabStatus)) return { anchorDeactivated: false, newlyCompleted: [] };

  const anchorId = rehabStatus.anchorId;
  const { rows: cases } = await pool.query(
    `select u.user_id,
            (select ar.metadata->'compensation' from agency_referrals ar
             where ar.user_id = u.user_id and ar.referred_to_role = 'District Welfare Officer'
             order by ar.created_at desc limit 1) as compensation
     from users u
     where (u.user_id = $1 or u.linked_to_user_id = $1) and u.case_completed_at is null`,
    [anchorId]
  );

  const newlyCompleted = [];
  for (const c of cases) {
    if (isCompensationComplete(c.compensation)) {
      await pool.query(`update users set case_completed_at = now() where user_id = $1`, [c.user_id]);
      await writeAuditLog({ userId: c.user_id, action: 'update', entityType: 'case_completion', entityId: c.user_id });
      newlyCompleted.push(c.user_id);
    }
  }

  const { rows: remaining } = await pool.query(
    `select count(*) as c from users where (user_id = $1 or linked_to_user_id = $1) and case_completed_at is null`,
    [anchorId]
  );
  let anchorDeactivated = false;
  if (Number(remaining[0].c) === 0) {
    const { error } = await supabase.from('users').update({ status: 'inactive' }).eq('user_id', anchorId);
    if (error) {
      console.error('checkAndCompleteCasesForPerson: could not deactivate anchor', error.message, { anchorId });
    } else {
      await writeAuditLog({ userId: anchorId, action: 'update', entityType: 'user_credentials_expired', entityId: anchorId });
      anchorDeactivated = true;
    }
  }

  return { anchorDeactivated, newlyCompleted };
}

module.exports = { isCompensationComplete, checkAndCompleteCasesForPerson };
