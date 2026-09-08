const { pool } = require('../db/pgPool');

// Threat Tier - a genuinely separate axis from the AI distress score
// (ai/scoring.js's Low/Moderate/High/Critical, computed from a victim's own
// check-in behaviour). Threat Tier measures EXTERNAL, objective danger from
// the accused/environment, computed from real signals already in this
// system: Investigating Officer's own custody-status assessment (their
// actual statutory function) plus genuine sos_events history - never a
// guess, never reusing the distress score's vocabulary or colours so the
// two are never confused in the UI.
const ACCUSED_STATUSES = ['In Custody', 'Out on Bail', 'Absconding', 'Convicted'];

// The PS's own named priority use case where an at-large/bailed accused is
// inherently higher-risk. Matched by name against case_types.name (a small,
// fixed, admin-curated list - no schema flag needed for 4 rows).
const INTIMIDATION_CASE_TYPES = ['Witness Facing Intimidation or Threats'];

const THREAT_TIERS = ['Routine', 'Guarded', 'Elevated', 'Severe'];

// A plain, explainable rule - deliberately NOT an AI/ML score. Unlike the
// distress score (which has real check-in volume behind it), this system
// has no historical threat-outcome data to train or validate a model
// against, so a transparent, auditable rule is the honest choice.
function computeThreatTier({ accusedStatus, caseTypeName, sosEventCount7d }) {
  // Nothing to go on yet - IO hasn't logged an accused status and there's no
  // SOS activity either. null is deliberately distinct from 'Routine' (a
  // confirmed low-risk assessment) - the frontend shows "Not yet assessed".
  if (!accusedStatus && sosEventCount7d === 0) return null;
  if (accusedStatus === 'Absconding' || sosEventCount7d >= 2) return 'Severe';
  if (
    (accusedStatus === 'Out on Bail' && INTIMIDATION_CASE_TYPES.includes(caseTypeName)) ||
    sosEventCount7d >= 1
  ) {
    return 'Elevated';
  }
  if (accusedStatus === 'Out on Bail') return 'Guarded';
  if (accusedStatus === 'In Custody' || accusedStatus === 'Convicted') return 'Routine';
  return null;
}

// Batched - one query for a whole list page's worth of cases, not N+1.
async function getSosEventCounts(userIds, days) {
  if (!userIds || userIds.length === 0) return {};
  const { rows } = await pool.query(
    `select user_id, count(*)::int as count
     from sos_events
     where user_id = any($1) and triggered_at > now() - ($2 || ' days')::interval
     group by user_id`,
    [userIds, days]
  );
  return rows.reduce((acc, r) => { acc[r.user_id] = r.count; return acc; }, {});
}

async function getSosEventCount(userId, days) {
  const counts = await getSosEventCounts([userId], days);
  return counts[userId] || 0;
}

module.exports = { ACCUSED_STATUSES, THREAT_TIERS, computeThreatTier, getSosEventCounts, getSosEventCount };
