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

// ===== "Looks empty" fixes: additional real sections =====
// Added after user feedback that a thin-data district (Pune: ~5 real cases)
// still read as a sparse/broken report with only summary/cases/trend/
// counsellors/response-times. These give a report real page weight even at
// small scale by surfacing MORE distinct real facts about the same handful
// of cases (their type/stage breakdown, enrollment activity, alert/
// intervention/legal-proceeding activity), not by padding existing sections.

// District-tier and (for caseTypeDistribution) State/National-tier - case
// type is a current-state fact (not period-scoped), same reasoning as the
// existing `cases` table above.
async function computeCaseTypeDistribution(jurisdictionIds) {
  const { rows } = await pool.query(
    `select ct.name, count(*) as count
     from users u
     join case_types ct on ct.case_type_id = u.case_type_id
     where u.jurisdiction_id = any($1::uuid[])
     group by ct.name
     order by count(*) desc`,
    [jurisdictionIds]
  );
  return rows.map((r) => ({ caseTypeName: r.name, count: Number(r.count) }));
}

// District-tier only - case_stage is likewise current-state, not period-scoped.
async function computeCaseStageDistribution(districtJurisdictionId) {
  const { rows } = await pool.query(
    `select case_stage, count(*) as count
     from users
     where jurisdiction_id = $1
     group by case_stage
     order by count(*) desc`,
    [districtJurisdictionId]
  );
  return rows.map((r) => ({ caseStage: r.case_stage, count: Number(r.count) }));
}

// District-tier only. Identifies cases by docketNumber/caseTypeName only -
// never joins user_identity - same privacy boundary the existing `cases`
// table already respects (docket + case-level facts, never a victim's own
// name/contact/address).
async function computeNewEnrollments(districtJurisdictionId, periodStart, periodEnd) {
  const { rows } = await pool.query(
    `select u.docket_number, ct.name as case_type_name, u.enrolled_at
     from users u
     join case_types ct on ct.case_type_id = u.case_type_id
     where u.jurisdiction_id = $1 and u.enrolled_at >= $2 and u.enrolled_at <= $3
     order by u.enrolled_at desc`,
    [districtJurisdictionId, periodStart.toISOString(), periodEnd.toISOString()]
  );
  return {
    count: rows.length,
    cases: rows.map((r) => ({ docketNumber: r.docket_number, caseTypeName: r.case_type_name, enrolledAt: r.enrolled_at })),
  };
}

// District-tier only. Real `alerts` table (the Critical-score-triggered
// flow) - deliberately separate from `responseTimes` above, which covers
// the rarer user-initiated `sos_events` table. alerts has no
// acknowledged_at timestamp column (only sos_events does) - "Acknowledged"
// here is a status value (alert_statuses.name), not a timestamp.
async function computeAlertVolume(districtJurisdictionId, periodStart, periodEnd) {
  const { rows } = await pool.query(
    `select ast.name as status_name, count(*) as count
     from alerts a
     join users u on u.user_id = a.user_id
     join alert_statuses ast on ast.alert_status_id = a.alert_status_id
     where u.jurisdiction_id = $1 and a.triggered_at >= $2 and a.triggered_at <= $3
     group by ast.name`,
    [districtJurisdictionId, periodStart.toISOString(), periodEnd.toISOString()]
  );
  const byStatus = new Map(rows.map((r) => [r.status_name, Number(r.count)]));
  const open = byStatus.get('Open') || 0;
  const acknowledged = byStatus.get('Acknowledged') || 0;
  const resolved = byStatus.get('Resolved') || 0;
  return { open, acknowledged, resolved, total: open + acknowledged + resolved };
}

// District-tier only.
async function computeInterventionSummary(districtJurisdictionId, periodStart, periodEnd) {
  const { rows } = await pool.query(
    `select it.name as type_name,
            count(*) as total_count,
            count(*) filter (where i.completed_at is not null) as completed_count
     from interventions i
     join users u on u.user_id = i.user_id
     join intervention_types it on it.intervention_type_id = i.intervention_type_id
     where u.jurisdiction_id = $1 and i.recommended_at >= $2 and i.recommended_at <= $3
     group by it.name
     order by count(*) desc`,
    [districtJurisdictionId, periodStart.toISOString(), periodEnd.toISOString()]
  );
  return rows.map((r) => {
    const totalCount = Number(r.total_count);
    const completedCount = Number(r.completed_count);
    return { interventionTypeName: r.type_name, totalCount, completedCount, notCompletedCount: totalCount - completedCount };
  });
}

const NO_COURT_RECORDS_MESSAGE = "No court case records generated yet for this district's cases";

// District-tier only. court_case_details rows are LAZILY generated - only
// once a victim actually opens Case Details in their own app at least once
// (user.routes.js's GET /court-case/:userId) - never backfilled up front,
// so this is genuinely expected to be sparse/empty on live data right now.
// Handled honestly (a stated zero-records message returned alongside the
// zeroed fields, not a broken/empty table) rather than pretending there's
// simply nothing here - same "state it explicitly" convention this codebase
// already uses for its simulated-data disclosures elsewhere (see
// user.routes.js's own `note` field on this same endpoint).
//
// Identifies cases by docketNumber only in upcomingHearings - never joins
// user_identity, same privacy boundary as computeNewEnrollments above.
async function computeLegalProceedings(districtJurisdictionId, periodStart, periodEnd) {
  const { rows } = await pool.query(
    `select u.docket_number, ccd.case_status, ccd.acts_sections, ccd.next_hearing_date, ccd.next_hearing_purpose
     from court_case_details ccd
     join users u on u.user_id = ccd.user_id
     where u.jurisdiction_id = $1`,
    [districtJurisdictionId]
  );

  if (rows.length === 0) {
    return { casesWithRecord: 0, pendingCount: 0, disposedCount: 0, topActsSections: [], upcomingHearings: [], message: NO_COURT_RECORDS_MESSAGE };
  }

  let pendingCount = 0;
  let disposedCount = 0;
  const actsSectionCounts = new Map();
  const upcomingHearings = [];
  const periodStartMs = periodStart.getTime();
  const periodEndMs = periodEnd.getTime();

  for (const r of rows) {
    if (r.case_status === 'Pending') pendingCount += 1;
    else if (r.case_status === 'Disposed') disposedCount += 1;

    // acts_sections is a jsonb array of plain strings (see
    // courtCaseSimulation.js's actsFor) - defensively guarded against any
    // other shape rather than trusting it, since this is simulated data
    // whose generator could change independently of this file.
    if (Array.isArray(r.acts_sections)) {
      for (const entry of r.acts_sections) {
        const label = String(entry);
        actsSectionCounts.set(label, (actsSectionCounts.get(label) || 0) + 1);
      }
    }

    if (r.next_hearing_date) {
      const t = new Date(r.next_hearing_date).getTime();
      if (!Number.isNaN(t) && t >= periodStartMs && t <= periodEndMs) {
        upcomingHearings.push({ docketNumber: r.docket_number, nextHearingDate: r.next_hearing_date, nextHearingPurpose: r.next_hearing_purpose });
      }
    }
  }

  const topActsSections = [...actsSectionCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([label, count]) => ({ label, count }));

  upcomingHearings.sort((a, b) => new Date(a.nextHearingDate).getTime() - new Date(b.nextHearingDate).getTime());

  return { casesWithRecord: rows.length, pendingCount, disposedCount, topActsSections, upcomingHearings, message: null };
}

// ===== Trend direction (State/National rollup rows) =====
// Copied from districtAdmin.routes.js's own computeAverageScore/
// computeTrendDirection - self-contained here per this file's own "no
// shared imports across role folders" reasoning (reportSnapshot.js is
// itself the one exception, being shared code imported BY all 3 admin route
// files - see this file's header comment), not imported from a route file.
const TREND_PERIOD_DAYS = 30;
const TREND_FLAT_THRESHOLD = 2; // point-difference below which a change reads as noise, not a real trend

async function computeAverageScoreForTrend(jurisdictionIds, sinceIso, untilIso) {
  const { rows } = await pool.query(
    `select ds.score_value
     from distress_scores ds
     join users u on u.user_id = ds.user_id
     where u.jurisdiction_id = any($1::uuid[])
       and ds.computed_at >= $2
       and ($3::timestamptz is null or ds.computed_at < $3)`,
    [jurisdictionIds, sinceIso, untilIso || null]
  );
  if (rows.length === 0) return null;
  const sum = rows.reduce((acc, r) => acc + Number(r.score_value), 0);
  return sum / rows.length;
}

async function computeTrendDirection(jurisdictionIds) {
  const now = Date.now();
  const periodStart = new Date(now - TREND_PERIOD_DAYS * 86400000).toISOString();
  const priorPeriodStart = new Date(now - 2 * TREND_PERIOD_DAYS * 86400000).toISOString();

  const [currentAvg, priorAvg] = await Promise.all([
    computeAverageScoreForTrend(jurisdictionIds, periodStart, null),
    computeAverageScoreForTrend(jurisdictionIds, priorPeriodStart, periodStart),
  ]);

  if (currentAvg === null || priorAvg === null) return 'flat';
  if (currentAvg > priorAvg + TREND_FLAT_THRESHOLD) return 'up';
  if (currentAvg < priorAvg - TREND_FLAT_THRESHOLD) return 'down';
  return 'flat';
}

// ===== Reporting compliance (State: child districts; National: child
// states) ===== Which children have actually SUBMITTED (their own PRIMARY
// recipient row, status Submitted or Reviewed) a report whose period
// overlaps THIS report's own period - a real oversight metric a State/
// National admin can act on ("12 of 36 districts reported this period").
async function computeReportingCompliance(parentJurisdictionId, periodStart, periodEnd, children) {
  const childIds = children.map((c) => c.jurisdiction_id);
  if (childIds.length === 0) return [];

  // distinct on (r.jurisdiction_id), preferring a 'Reviewed' row over a
  // merely 'Submitted' one if a child somehow has both within an
  // overlapping period - either way counts as "reported."
  const { rows } = await pool.query(
    `select distinct on (r.jurisdiction_id) r.jurisdiction_id, rr.status
     from report_recipients rr
     join reports r on r.report_id = rr.report_id
     where rr.recipient_type = 'jurisdiction' and rr.jurisdiction_id = $1 and rr.is_primary = true
       and rr.status in ('Submitted', 'Reviewed')
       and r.period_start <= $2 and r.period_end >= $3
       and r.jurisdiction_id = any($4::uuid[])
     order by r.jurisdiction_id, (rr.status = 'Reviewed') desc`,
    [parentJurisdictionId, periodEnd.toISOString(), periodStart.toISOString(), childIds]
  );

  const statusByChildId = new Map(rows.map((r) => [r.jurisdiction_id, r.status]));
  return children.map((c) => ({
    jurisdictionId: c.jurisdiction_id,
    name: c.name,
    hasReported: statusByChildId.has(c.jurisdiction_id),
    reportStatus: statusByChildId.get(c.jurisdiction_id) || null,
  }));
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
  const [
    distressTrend,
    counsellors,
    responseTimes,
    caseTypeDistribution,
    caseStageDistribution,
    newEnrollments,
    alertVolume,
    interventionSummary,
    legalProceedings,
  ] = await Promise.all([
    computeDistressTrendSection([districtJurisdictionId], periodStart, periodEnd, periodType),
    computeCounsellorSection(districtJurisdictionId),
    computeResponseTimeSection([districtJurisdictionId], periodStart, periodEnd),
    computeCaseTypeDistribution([districtJurisdictionId]),
    computeCaseStageDistribution(districtJurisdictionId),
    computeNewEnrollments(districtJurisdictionId, periodStart, periodEnd),
    computeAlertVolume(districtJurisdictionId, periodStart, periodEnd),
    computeInterventionSummary(districtJurisdictionId, periodStart, periodEnd),
    computeLegalProceedings(districtJurisdictionId, periodStart, periodEnd),
  ]);

  return {
    tier: 'district',
    summary,
    cases,
    caseTypeDistribution,
    caseStageDistribution,
    newEnrollments,
    distressTrend,
    alertVolume,
    interventionSummary,
    legalProceedings,
    counsellors,
    responseTimes,
  };
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
  const zeroFilledDistricts = children.map((child) => zeroFillRow(child.jurisdiction_id, child.name, byGroupId.get(child.jurisdiction_id)));
  const summary = sumRows(zeroFilledDistricts);

  // Trend direction per child - one (smaller, parallelized) pass per child,
  // exact same pattern as GET /dashboard/:jurisdictionId's own breakdown in
  // districtAdmin.routes.js: a child's own trend is computed over ITS OWN
  // descendant subtree (a no-op walk for an already-leaf district), not the
  // whole state's.
  const [districts, distressTrend, caseTypeDistribution, reportingCompliance] = await Promise.all([
    Promise.all(zeroFilledDistricts.map(async (d) => {
      const childDescendants = await getDescendantJurisdictionIds(d.jurisdictionId);
      const trendDirection = await computeTrendDirection(childDescendants);
      return { ...d, trendDirection };
    })),
    computeDistressTrendSection(allDescendantIds, periodStart, periodEnd, periodType),
    computeCaseTypeDistribution(allDescendantIds),
    computeReportingCompliance(stateJurisdictionId, periodStart, periodEnd, children),
  ]);

  return { tier: 'state', summary, districts, caseTypeDistribution, distressTrend, reportingCompliance };
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

  const zeroFilledStates = children.map((child) => zeroFillRow(child.jurisdiction_id, child.name, byGroupId.get(child.jurisdiction_id)));
  const summary = sumRows(zeroFilledStates);

  // Trend direction per child state - same per-child parallelized pattern as
  // computeDistrictWiseSnapshot above, one level up (each state's own trend
  // over ITS OWN descendant district subtree).
  const [states, distressTrend, caseTypeDistribution, reportingCompliance] = await Promise.all([
    Promise.all(zeroFilledStates.map(async (s) => {
      const childDescendants = await getDescendantJurisdictionIds(s.jurisdictionId);
      const trendDirection = await computeTrendDirection(childDescendants);
      return { ...s, trendDirection };
    })),
    computeDistressTrendSection(allDescendantIds, periodStart, periodEnd, periodType),
    computeCaseTypeDistribution(allDescendantIds),
    computeReportingCompliance(nationalJurisdictionId, periodStart, periodEnd, children),
  ]);

  return { tier: 'national', summary, states, caseTypeDistribution, distressTrend, reportingCompliance };
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
  computeCaseTypeDistribution,
  computeCaseStageDistribution,
  computeNewEnrollments,
  computeAlertVolume,
  computeInterventionSummary,
  computeLegalProceedings,
  computeTrendDirection,
  computeReportingCompliance,
};
