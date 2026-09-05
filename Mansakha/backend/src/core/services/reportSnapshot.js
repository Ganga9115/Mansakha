// Detailed PDF Reports - cross-jurisdiction aggregation for the 3 report
// tiers (District/State/National). This IS shared code (imported by all 3
// admin route files' /reports/generate), unlike the role route files
// themselves, which each keep their own independent copy of every route per
// this codebase's "no shared imports across role folders" convention - the
// query shapes below are adapted from (not imported from)
// districtAdmin.routes.js's own countUsersByRisk/countUsersByRiskGroupedByChild,
// same reasoning that file's own header comment gives for why those aren't
// reused directly either.
const { pool } = require('../db/pgPool');
const { supabase } = require('../db/supabaseClient');
const { getDescendantJurisdictionIds, getChildJurisdictions } = require('./jurisdictionTree');
const { resolveTrendBuckets } = require('./reportPeriods');
const { bucketize } = require('./reportBuckets');

// Order the risk badges will always sort in across every table this feature
// renders (cases list, comparison rows) - Critical first, matching the
// existing dashboard/Case Queue convention.
const RISK_ORDER_SQL = `case rl.name when 'Critical' then 1 when 'High' then 2 when 'Moderate' then 3 when 'Low' then 4 else 5 end`;

// ===== Shared sub-section helpers =====

// Distress trend line, shared by all 3 tiers - District scopes this to just
// itself ([districtJurisdictionId]), State/National to their full descendant
// district subtree. DISTINCT matters here (see /reports-analytics's own
// comment in districtAdmin.routes.js) - a linked dependent case would
// otherwise double-count one real reading via the coalesce join below.
//
// periodType is a 4th param (not part of the top-level compute* functions'
// documented 3-arg call shape) so this can bucket with reportPeriods.js's
// calendar-aware resolveTrendBuckets (day-by-day for a weekly report,
// week-by-week for monthly, month-by-month for quarterly) instead of always
// falling back to its generic "6 even slices" 'custom' behavior. Defaults to
// 'custom' so a caller that only passes 3 args still gets a sane (if less
// calendar-aware) trend rather than a crash.
async function computeDistressTrendSection(jurisdictionIds, periodStart, periodEnd, periodType = 'custom') {
  const { rows } = await pool.query(
    `select distinct ds.score_id, ds.computed_at, ds.score_value
     from distress_scores ds
     join users u on coalesce(u.linked_to_user_id, u.user_id) = ds.user_id
     where u.jurisdiction_id = any($1::uuid[]) and ds.computed_at >= $2 and ds.computed_at <= $3`,
    [jurisdictionIds, periodStart.toISOString(), periodEnd.toISOString()]
  );

  const buckets = resolveTrendBuckets(periodStart, periodEnd, periodType);
  const perBucket = bucketize(rows, buckets, 'computed_at');
  return buckets.map((b, i) => {
    const rowsInBucket = perBucket[i];
    const avg = rowsInBucket.length
      ? rowsInBucket.reduce((sum, r) => sum + Number(r.score_value), 0) / rowsInBucket.length
      : null;
    return { label: b.label, avgScore: avg !== null ? Math.round(avg * 10) / 10 : null };
  });
}

// Condensed version of /counsellors/performance/:jurisdictionId's logic
// (districtAdmin.routes.js) - District-tier report section only, so no
// descendant-subtree walk (a counsellor is always assigned to a single
// district-level jurisdiction, exact match here).
async function computeCounsellorSection(districtJurisdictionId) {
  // Two FKs from official_roles into officials (official_id AND assigned_by)
  // make a bare officials(full_name) embed ambiguous to PostgREST - same
  // reasoning as the existing /counsellors/performance route, sidestepped
  // the same way (a second plain query below instead of an embed hint).
  const { data: roleRows, error: roleErr } = await supabase
    .from('official_roles')
    .select('official_id, roles(role_name)')
    .eq('jurisdiction_id', districtJurisdictionId)
    .is('revoked_at', null);
  if (roleErr) throw new Error(roleErr.message);

  const counsellorIds = (roleRows || []).filter((r) => r.roles.role_name === 'Counsellor').map((r) => r.official_id);
  if (counsellorIds.length === 0) return [];

  const { data: officialRows } = await supabase.from('officials').select('official_id, full_name').in('official_id', counsellorIds);
  const fullNameById = new Map((officialRows || []).map((o) => [o.official_id, o.full_name]));

  // One query for every counsellor's users, not one per counsellor - same
  // fix as the existing /counsellors/performance route.
  const { data: allUsers } = await supabase
    .from('users')
    .select('assigned_counsellor_id, status, linked_to_user_id, distress_scores(score_value, computed_at)')
    .in('assigned_counsellor_id', counsellorIds);

  const usersByCounsellor = new Map(counsellorIds.map((id) => [id, []]));
  for (const u of allUsers || []) {
    usersByCounsellor.get(u.assigned_counsellor_id)?.push(u);
  }

  return counsellorIds.map((officialId) => {
    const users = usersByCounsellor.get(officialId) || [];
    const activeCaseCount = users.filter((u) => u.status === 'active').length;

    // EFFICACY PROXY - exact same documented judgment call as
    // /counsellors/performance (earliest-vs-latest distress score per
    // currently-assigned user, skipping linked/dependent cases and anyone
    // with fewer than 2 readings). Not redesigned here, per the spec.
    let dropSum = 0;
    let consideredCount = 0;
    for (const u of users) {
      if (u.linked_to_user_id) continue;
      const scores = (u.distress_scores || []).slice().sort((a, b) => new Date(a.computed_at) - new Date(b.computed_at));
      if (scores.length < 2) continue;
      dropSum += scores[0].score_value - scores[scores.length - 1].score_value;
      consideredCount += 1;
    }

    return {
      officialId,
      fullName: fullNameById.get(officialId) || null,
      activeCaseCount,
      avgDistressPointDrop: consideredCount > 0 ? Math.round((dropSum / consideredCount) * 10) / 10 : null,
      usersConsideredForEfficacy: consideredCount,
    };
  });
}

// District-tier report section only. There is no historical alert-
// acknowledgment table (alerts only carries a current status, no timestamped
// transitions) - honestly scoped to sos_events, which DOES have real
// triggered_at/acknowledged_at/resolved_at columns.
async function computeResponseTimeSection(jurisdictionIds, periodStart, periodEnd) {
  const { rows } = await pool.query(
    `select se.triggered_at, se.acknowledged_at, se.resolved_at
     from sos_events se
     join users u on u.user_id = se.user_id
     where u.jurisdiction_id = any($1::uuid[]) and se.triggered_at >= $2 and se.triggered_at <= $3`,
    [jurisdictionIds, periodStart.toISOString(), periodEnd.toISOString()]
  );

  let ackSum = 0;
  let ackCount = 0;
  let resolveSum = 0;
  let resolveCount = 0;
  let openCount = 0;
  for (const r of rows) {
    const triggeredAt = new Date(r.triggered_at).getTime();
    if (r.acknowledged_at) {
      ackSum += (new Date(r.acknowledged_at).getTime() - triggeredAt) / 60000;
      ackCount += 1;
    }
    if (r.resolved_at) {
      resolveSum += (new Date(r.resolved_at).getTime() - triggeredAt) / 60000;
      resolveCount += 1;
    } else {
      openCount += 1;
    }
  }

  return {
    avgAcknowledgeMinutes: ackCount > 0 ? Math.round((ackSum / ackCount) * 10) / 10 : null,
    avgResolveMinutes: resolveCount > 0 ? Math.round((resolveSum / resolveCount) * 10) / 10 : null,
    openSosCount: openCount,
    totalSosCount: rows.length,
  };
}

// Shared by computeDistrictWiseSnapshot and computeStateWiseSnapshot below -
// both need "risk-tier counts grouped by some jurisdiction key," differing
// only in whether that key is the user's own jurisdiction_id (State's
// children are districts, the group IS the user's jurisdiction) or that
// jurisdiction's parent_id (National's children are states, so districts
// roll up one level) - identical shape to districtAdmin.routes.js's own
// countUsersByRiskGroupedByChild, adapted to this feature's own field names.
async function countRiskByGroup(jurisdictionIds, groupByParent) {
  const groupExpr = groupByParent ? 'j.parent_id' : 'u.jurisdiction_id';
  const { rows } = await pool.query(
    `select ${groupExpr} as group_id,
            count(distinct u.user_id) as total,
            count(distinct u.user_id) filter (where rl.name = 'Moderate') as moderate,
            count(distinct u.user_id) filter (where rl.name = 'High') as high,
            count(distinct u.user_id) filter (where rl.name = 'Critical') as critical
     from users u
     join jurisdictions j on j.jurisdiction_id = u.jurisdiction_id
     left join lateral (
       select risk_level_id from distress_scores where user_id = coalesce(u.linked_to_user_id, u.user_id) order by computed_at desc limit 1
     ) ds on true
     left join risk_levels rl on rl.risk_level_id = ds.risk_level_id
     where u.jurisdiction_id = any($1::uuid[])
     group by ${groupExpr}`,
    [jurisdictionIds]
  );
  return new Map(rows.map((r) => [r.group_id, r]));
}

function zeroFillRow(jurisdictionId, name, group) {
  return {
    jurisdictionId,
    name,
    totalCases: group ? Number(group.total) : 0,
    criticalCases: group ? Number(group.critical) : 0,
    highRiskCases: group ? Number(group.high) : 0,
    moderateCases: group ? Number(group.moderate) : 0,
  };
}

function sumRows(rows) {
  return rows.reduce(
    (acc, r) => ({
      totalCases: acc.totalCases + r.totalCases,
      criticalCases: acc.criticalCases + r.criticalCases,
      highRiskCases: acc.highRiskCases + r.highRiskCases,
      moderateCases: acc.moderateCases + r.moderateCases,
    }),
    { totalCases: 0, criticalCases: 0, highRiskCases: 0, moderateCases: 0 }
  );
}

// ===== Top-level tier snapshots =====

// District's own report - every one of the district's own cases as its own
// row (not an aggregate). Multi-Case-Per-Person Support: a dependent case's
// risk is read through its anchor via coalesce(u.linked_to_user_id, u.user_id),
// same as countUsersByRisk.
async function computeCaseWiseSnapshot(districtJurisdictionId, periodStart, periodEnd, periodType = 'custom') {
  const { rows } = await pool.query(
    `select u.user_id, u.docket_number, ct.name as case_type_name, u.case_stage,
            o.full_name as counsellor_name,
            ds.score_value, rl.name as risk_level_name
     from users u
     join case_types ct on ct.case_type_id = u.case_type_id
     left join officials o on o.official_id = u.assigned_counsellor_id
     left join lateral (
       select score_value, risk_level_id
       from distress_scores
       where user_id = coalesce(u.linked_to_user_id, u.user_id)
       order by computed_at desc limit 1
     ) ds on true
     left join risk_levels rl on rl.risk_level_id = ds.risk_level_id
     where u.jurisdiction_id = $1
     order by ${RISK_ORDER_SQL}, u.docket_number`,
    [districtJurisdictionId]
  );

  const cases = rows.map((r) => ({
    userId: r.user_id,
    docketNumber: r.docket_number,
    caseTypeName: r.case_type_name,
    caseStage: r.case_stage,
    counsellorName: r.counsellor_name || 'Unassigned',
    riskLevel: r.risk_level_name || null,
    score: r.score_value !== null ? Number(r.score_value) : null,
  }));

  const summary = { totalCases: cases.length, criticalCases: 0, highRiskCases: 0, moderateCases: 0, lowRiskCases: 0 };
  for (const c of cases) {
    if (c.riskLevel === 'Critical') summary.criticalCases += 1;
    else if (c.riskLevel === 'High') summary.highRiskCases += 1;
    else if (c.riskLevel === 'Moderate') summary.moderateCases += 1;
    else if (c.riskLevel === 'Low') summary.lowRiskCases += 1;
  }

  // District is a leaf jurisdiction - every sub-section below scopes to just
  // [districtJurisdictionId], no descendant walk needed.
  const [distressTrend, counsellors, responseTimes] = await Promise.all([
    computeDistressTrendSection([districtJurisdictionId], periodStart, periodEnd, periodType),
    computeCounsellorSection(districtJurisdictionId),
    computeResponseTimeSection([districtJurisdictionId], periodStart, periodEnd),
  ]);

  return { tier: 'district', summary, cases, distressTrend, counsellors, responseTimes };
}

// State's own report - one row per child district, side by side (comparative,
// not per-case).
async function computeDistrictWiseSnapshot(stateJurisdictionId, periodStart, periodEnd, periodType = 'custom') {
  const [allDescendantIds, children] = await Promise.all([
    getDescendantJurisdictionIds(stateJurisdictionId),
    getChildJurisdictions(stateJurisdictionId),
  ]);

  const byGroupId = await countRiskByGroup(allDescendantIds, false); // State's children ARE districts - group by the user's own jurisdiction_id

  // Zero-fill: a real district with 0 current cases must still appear as a
  // row, not be silently dropped.
  const districts = children.map((child) => zeroFillRow(child.jurisdiction_id, child.name, byGroupId.get(child.jurisdiction_id)));
  const summary = sumRows(districts);

  const distressTrend = await computeDistressTrendSection(allDescendantIds, periodStart, periodEnd, periodType);

  return { tier: 'state', summary, districts, distressTrend };
}

// National's own report - one row per child STATE, same shape one level up.
// Districts roll up into their state via j.parent_id (group by parent, not
// by the user's own jurisdiction_id).
async function computeStateWiseSnapshot(nationalJurisdictionId, periodStart, periodEnd, periodType = 'custom') {
  const [allDescendantIds, children] = await Promise.all([
    getDescendantJurisdictionIds(nationalJurisdictionId), // every district under every state
    getChildJurisdictions(nationalJurisdictionId), // the states themselves
  ]);

  const byGroupId = await countRiskByGroup(allDescendantIds, true);

  const states = children.map((child) => zeroFillRow(child.jurisdiction_id, child.name, byGroupId.get(child.jurisdiction_id)));
  const summary = sumRows(states);

  const distressTrend = await computeDistressTrendSection(allDescendantIds, periodStart, periodEnd, periodType);

  return { tier: 'national', summary, states, distressTrend };
}

module.exports = {
  computeCaseWiseSnapshot,
  computeDistrictWiseSnapshot,
  computeStateWiseSnapshot,
  // Exported for reuse/testing convenience - not required by the route files,
  // which only ever call the 3 tier-level functions above.
  computeDistressTrendSection,
  computeCounsellorSection,
  computeResponseTimeSection,
};
