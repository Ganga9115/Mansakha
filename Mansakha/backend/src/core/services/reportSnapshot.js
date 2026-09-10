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
// computeThreatTier/getSosEventCounts ARE genuinely shared code (unlike a
// role route file's own logic) - core/services, no jurisdiction/role
// framing of their own, already the one pure function this whole system
// uses to turn accused-status + SOS history into a Threat Tier. Reused here
// exactly as protectionOfficer.routes.js reuses it, not reimplemented.
const { computeThreatTier, getSosEventCounts } = require('./threatAssessment');

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
// (districtAdmin.routes.js). Takes a jurisdictionIds ARRAY (not a single
// district id) so the same function serves both District's own per-
// counsellor detail ([districtJurisdictionId]) and State/National's
// per-child rollup below (a single child district's id, or a whole child
// state's descendant district set) - a counsellor is always assigned to a
// single district-level jurisdiction, so this is still an exact-match
// lookup, just over however many district ids the caller passes.
async function computeCounsellorSection(jurisdictionIds) {
  // Two FKs from official_roles into officials (official_id AND assigned_by)
  // make a bare officials(full_name) embed ambiguous to PostgREST - same
  // reasoning as the existing /counsellors/performance route, sidestepped
  // the same way (a second plain query below instead of an embed hint).
  const { data: roleRows, error: roleErr } = await supabase
    .from('official_roles')
    .select('official_id, roles(role_name)')
    .in('jurisdiction_id', jurisdictionIds)
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

// Reduces computeCounsellorSection's per-counsellor array down to one
// aggregate row, for State/National's per-child rollup (Every kind of data
// belongs at every tier - District shows individual counsellors, State/
// National show one summary row per child district/state). The efficacy
// average is weighted by usersConsideredForEfficacy (not a plain mean of
// means) - a counsellor considered over 5 cases should count 5x as much as
// one considered over 1, same reasoning a straight per-counsellor average
// would get wrong.
function aggregateCounsellorRollup(counsellors) {
  let totalActiveCases = 0;
  let dropSum = 0;
  let consideredCount = 0;
  for (const c of counsellors) {
    totalActiveCases += c.activeCaseCount;
    if (c.avgDistressPointDrop !== null) {
      dropSum += c.avgDistressPointDrop * c.usersConsideredForEfficacy;
      consideredCount += c.usersConsideredForEfficacy;
    }
  }
  return {
    counsellorCount: counsellors.length,
    totalActiveCases,
    avgDistressPointDrop: consideredCount > 0 ? Math.round((dropSum / consideredCount) * 10) / 10 : null,
    usersConsideredForEfficacy: consideredCount,
  };
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
// Fixed ladder (not data-driven) - reads better in a fixed order even when
// some buckets are empty, same reasoning caseStageDistribution's own fixed
// enum already relies on. Only ever populated when there's at least one
// real Pending case, per the "don't show 4 zero-rows as if they mean
// something" rule - see computeLegalProceedings below.
const AGING_BUCKET_ORDER = ['<3 months', '3-6 months', '6-12 months', '>1 year'];
function agingBucketFor(filingDate) {
  const ageMs = Date.now() - new Date(filingDate).getTime();
  const ageMonths = ageMs / (1000 * 60 * 60 * 24 * 30.44); // average month length - fine for a bucket boundary, not a billing calc
  if (ageMonths < 3) return '<3 months';
  if (ageMonths < 6) return '3-6 months';
  if (ageMonths < 12) return '6-12 months';
  return '>1 year';
}

async function computeLegalProceedings(districtJurisdictionId, periodStart, periodEnd) {
  const { rows } = await pool.query(
    `select u.docket_number, ccd.case_status, ccd.acts_sections, ccd.next_hearing_date, ccd.next_hearing_purpose, ccd.filing_date
     from court_case_details ccd
     join users u on u.user_id = ccd.user_id
     where u.jurisdiction_id = $1`,
    [districtJurisdictionId]
  );

  if (rows.length === 0) {
    return { casesWithRecord: 0, pendingCount: 0, disposedCount: 0, topActsSections: [], upcomingHearings: [], pendencyAging: [], message: NO_COURT_RECORDS_MESSAGE };
  }

  let pendingCount = 0;
  let disposedCount = 0;
  const actsSectionCounts = new Map();
  const upcomingHearings = [];
  const agingCounts = new Map(AGING_BUCKET_ORDER.map((b) => [b, 0]));
  const periodStartMs = periodStart.getTime();
  const periodEndMs = periodEnd.getTime();

  for (const r of rows) {
    if (r.case_status === 'Pending') {
      pendingCount += 1;
      // filing_date can be null on a not-yet-fully-synced record - skip
      // aging for those rather than mis-bucketing on a missing date.
      if (r.filing_date) {
        const bucket = agingBucketFor(r.filing_date);
        agingCounts.set(bucket, agingCounts.get(bucket) + 1);
      }
    } else if (r.case_status === 'Disposed') {
      disposedCount += 1;
    }

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

  // Zero-filled buckets ONLY when there's at least one real Pending case to
  // bucket - with zero Pending cases (all Disposed, say), 4 zero-rows would
  // read as meaningful data when there's genuinely nothing to show; the
  // parent section's own pendingCount: 0 already communicates that case.
  const pendencyAging = pendingCount > 0 ? AGING_BUCKET_ORDER.map((bucket) => ({ bucket, count: agingCounts.get(bucket) })) : [];

  return { casesWithRecord: rows.length, pendingCount, disposedCount, topActsSections, upcomingHearings, pendencyAging, message: null };
}

// ===== New-role case/user data (Section A - added for coordination-role
// oversight visibility). Every query below identifies a case by
// docket_number/case_type/jurisdiction only - the SAME privacy convention
// computeNewEnrollments/computeCaseWiseSnapshot already established for
// this file (never user_identity.full_name/contact_number/address). The one
// new column read here, user_identity.bank_account_number, is read ONLY as
// an `is not null` boolean - never its value - see computeCompensationReliefSummary.
// Protection Officer's own single-referral Dispatch Details (victim name/
// phone/address) stays untouched by this - nothing here widens that.

const NO_INVESTIGATION_RECORDS_MESSAGE = "No investigation records generated yet for this district's cases";

// District-tier. Current-state snapshot (not period-scoped) - same
// reasoning caseTypeDistribution/caseStageDistribution already give:
// accused status/chargesheet status are where-things-stand facts, not
// period events. investigation_records is created lazily by IO on first
// PATCH (confirmed: no insert anywhere else) - LEFT JOIN, honest zero-state
// message when a district has none yet, same pattern computeLegalProceedings
// already uses for court_case_details.
// jurisdictionIds is an array everywhere in this function (a single-district
// caller passes a 1-element array) - this lets the exact same function serve
// both the Report's own per-district call and Analysis's flat whole-subtree
// aggregate (GET /reports-analytics, which already resolves a full
// descendant-id array for every tier).
async function computeInvestigationProgress(jurisdictionIds) {
  const { rows } = await pool.query(
    `select ir.accused_status, ir.chargesheet_status, ir.chargesheet_filed_at,
            ir.fir_document_path, ir.chargesheet_document_path, u.enrolled_at
     from users u
     left join investigation_records ir on ir.user_id = u.user_id
     where u.jurisdiction_id = any($1::uuid[])`,
    [jurisdictionIds]
  );

  const withRecord = rows.filter((r) => r.chargesheet_status !== null);
  if (withRecord.length === 0) {
    return {
      casesWithRecord: 0, accusedStatusDistribution: [], chargesheetFiled: 0, chargesheetNotFiled: 0,
      firDocumentOnFileCount: 0, chargesheetDocumentOnFileCount: 0, avgDaysToChargesheet: null,
      message: NO_INVESTIGATION_RECORDS_MESSAGE,
    };
  }

  const accusedCounts = new Map();
  let chargesheetFiled = 0;
  let firDocCount = 0;
  let chargesheetDocCount = 0;
  let daysSum = 0;
  let daysCount = 0;
  for (const r of withRecord) {
    if (r.accused_status) accusedCounts.set(r.accused_status, (accusedCounts.get(r.accused_status) || 0) + 1);
    if (r.chargesheet_status === 'Filed') chargesheetFiled += 1;
    if (r.fir_document_path) firDocCount += 1;
    if (r.chargesheet_document_path) chargesheetDocCount += 1;
    if (r.chargesheet_filed_at && r.enrolled_at) {
      daysSum += (new Date(r.chargesheet_filed_at).getTime() - new Date(r.enrolled_at).getTime()) / 86400000;
      daysCount += 1;
    }
  }

  return {
    casesWithRecord: withRecord.length,
    accusedStatusDistribution: [...accusedCounts.entries()].map(([status, count]) => ({ status, count })),
    chargesheetFiled,
    chargesheetNotFiled: withRecord.length - chargesheetFiled,
    firDocumentOnFileCount: firDocCount,
    chargesheetDocumentOnFileCount: chargesheetDocCount,
    avgDaysToChargesheet: daysCount > 0 ? Math.round((daysSum / daysCount) * 10) / 10 : null,
    message: null,
  };
}

// District-tier. Period-scoped (referred_to_role = 'Protection Officer'
// referrals CREATED this period) - a volume-of-activity section, same
// convention computeInterventionSummary/computeAlertVolume already use.
// Threat Tier isn't a stored column (protectionOfficer.routes.js computes
// it fresh on every read) - reused here the same way rather than
// duplicated: fetch each referral's own accused_status/case_type, batch the
// real 7-day SOS count via getSosEventCounts, then bucket through the same
// computeThreatTier function PO's own queue uses.
async function computeThreatProtectionSummary(jurisdictionIds, periodStart, periodEnd) {
  const { rows } = await pool.query(
    `select ar.status, ar.metadata, ar.user_id, ir.accused_status, ct.name as case_type_name
     from agency_referrals ar
     join users u on u.user_id = ar.user_id
     join case_types ct on ct.case_type_id = u.case_type_id
     left join investigation_records ir on ir.user_id = ar.user_id
     where ar.referred_to_role = 'Protection Officer' and u.jurisdiction_id = any($1::uuid[])
       and ar.created_at >= $2 and ar.created_at <= $3`,
    [jurisdictionIds, periodStart.toISOString(), periodEnd.toISOString()]
  );

  if (rows.length === 0) {
    return { totalReferrals: 0, originTypeDistribution: [], threatTierDistribution: [], resolutionOutcomeDistribution: [], resolvedCount: 0 };
  }

  const sosCounts = await getSosEventCounts(rows.map((r) => r.user_id), 7);

  const originCounts = new Map();
  const tierCounts = new Map();
  const outcomeCounts = new Map();
  let resolvedCount = 0;
  for (const r of rows) {
    const originType = r.metadata?.originType || 'Unspecified';
    originCounts.set(originType, (originCounts.get(originType) || 0) + 1);

    const tier = computeThreatTier({ accusedStatus: r.accused_status, caseTypeName: r.case_type_name, sosEventCount7d: sosCounts[r.user_id] || 0 });
    const tierLabel = r.metadata?.manualThreatTier || tier || 'Not yet assessed';
    tierCounts.set(tierLabel, (tierCounts.get(tierLabel) || 0) + 1);

    if (r.status === 'Resolved') {
      resolvedCount += 1;
      const category = r.metadata?.outcome?.category;
      if (category) outcomeCounts.set(category, (outcomeCounts.get(category) || 0) + 1);
    }
  }

  return {
    totalReferrals: rows.length,
    originTypeDistribution: [...originCounts.entries()].map(([originType, count]) => ({ originType, count })),
    threatTierDistribution: [...tierCounts.entries()].map(([tier, count]) => ({ tier, count })),
    resolutionOutcomeDistribution: [...outcomeCounts.entries()].map(([category, count]) => ({ category, count })),
    resolvedCount,
  };
}

const NO_DWO_REFERRALS_MESSAGE = "No cases have been referred to a District Welfare Officer yet";
// Duplicated from dwo.routes.js's own IMMEDIATE_RELIEF_COMPLIANCE_DAYS by
// this file's own established convention (header comment) of adapting a
// role route file's constants rather than importing across the role-folder
// boundary - keep this in sync if that threshold ever changes there.
const IMMEDIATE_RELIEF_COMPLIANCE_DAYS = 7;

// District-tier. Current-state snapshot (not period-scoped), same reasoning
// as computeInvestigationProgress above - relief/compensation status is a
// pipeline-position fact, not a period event. bank_account_number is read
// ONLY as `is not null` (a boolean), never selected as a value - the one
// hard privacy line this section must never cross.
async function computeCompensationReliefSummary(jurisdictionIds) {
  const { rows } = await pool.query(
    `select ar.metadata, ar.status, ar.created_at, (ui.bank_account_number is not null) as has_bank_details
     from agency_referrals ar
     join users u on u.user_id = ar.user_id
     left join user_identity ui on ui.user_id = coalesce(u.linked_to_user_id, u.user_id)
     where ar.referred_to_role = 'District Welfare Officer' and u.jurisdiction_id = any($1::uuid[])`,
    [jurisdictionIds]
  );

  if (rows.length === 0) {
    return {
      totalCases: 0, reliefStatusDistribution: [], reliefOverdueCount: 0,
      compensationVerifiedCount: 0, compensationStagesTotal: 0, compensationStagesPaid: 0,
      bankDetailsOnFileCount: 0, message: NO_DWO_REFERRALS_MESSAGE,
    };
  }

  const reliefCounts = new Map();
  let reliefOverdueCount = 0;
  let compensationVerifiedCount = 0;
  let stagesTotal = 0;
  let stagesPaid = 0;
  let bankDetailsOnFileCount = 0;

  for (const r of rows) {
    const relief = r.metadata?.immediateRelief;
    const reliefStatus = relief?.status || 'Not Requested';
    reliefCounts.set(reliefStatus, (reliefCounts.get(reliefStatus) || 0) + 1);
    // Same rule as dwo.routes.js's own computeImmediateReliefCompliance:
    // "Overdue" only while relief is still missing/Requested past the
    // compliance window - anything already moving (Approved/Provided)
    // is On Track regardless of age.
    if (reliefStatus === 'Not Requested' || reliefStatus === 'Requested') {
      const daysOpen = (Date.now() - new Date(r.created_at).getTime()) / 86400000;
      if (daysOpen > IMMEDIATE_RELIEF_COMPLIANCE_DAYS) reliefOverdueCount += 1;
    }

    const compensation = r.metadata?.compensation;
    if (compensation?.verifiedAt) {
      compensationVerifiedCount += 1;
      const stages = compensation.stages || [];
      stagesTotal += stages.length;
      stagesPaid += stages.filter((s) => s.status === 'Paid').length;
    }

    if (r.has_bank_details) bankDetailsOnFileCount += 1;
  }

  return {
    totalCases: rows.length,
    reliefStatusDistribution: [...reliefCounts.entries()].map(([status, count]) => ({ status, count })),
    reliefOverdueCount,
    compensationVerifiedCount,
    compensationStagesTotal: stagesTotal,
    compensationStagesPaid: stagesPaid,
    bankDetailsOnFileCount,
    message: null,
  };
}

// District-tier. Period-scoped (referrals CREATED this period), grouped by
// role - "is this case actually getting handled by the role it was sent
// to". Same shape as the existing computeInterventionSummary, just keyed by
// referred_to_role instead of intervention type.
async function computeAgencyReferralVolume(jurisdictionIds, periodStart, periodEnd) {
  const { rows } = await pool.query(
    `select ar.referred_to_role as role_name,
            count(*) as total_count,
            count(*) filter (where ar.status = 'Resolved') as resolved_count,
            avg(extract(epoch from (ar.resolved_at - ar.created_at)) / 86400) filter (where ar.resolved_at is not null) as avg_resolve_days
     from agency_referrals ar
     join users u on u.user_id = ar.user_id
     where u.jurisdiction_id = any($1::uuid[]) and ar.created_at >= $2 and ar.created_at <= $3
     group by ar.referred_to_role
     order by count(*) desc`,
    [jurisdictionIds, periodStart.toISOString(), periodEnd.toISOString()]
  );
  return rows.map((r) => {
    const totalCount = Number(r.total_count);
    const resolvedCount = Number(r.resolved_count);
    return {
      roleName: r.role_name,
      totalCount,
      resolvedCount,
      openCount: totalCount - resolvedCount,
      avgResolveDays: r.avg_resolve_days !== null ? Math.round(Number(r.avg_resolve_days) * 10) / 10 : null,
    };
  });
}

// Legal Aid Funnel - the dedicated pipeline's own lifecycle
// (migration_040: Submitted -> Under Review -> Verified -> Approved ->
// Active -> Completed, or -> Rejected at either of the first two stages),
// counted at each real stage a request currently sits in. Not
// period-scoped - like caseStageDistribution, "where things stand right
// now" is the useful reading, not "how many crossed a stage this window."
// jurisdictionIds scopes by the CASE's own district (legal_aid_requests
// has no jurisdiction column of its own - joined via users, same as every
// other Section A function).
const LEGAL_AID_STATUSES = ['Submitted', 'Under Review', 'Verified', 'Approved', 'Active', 'Completed', 'Rejected'];

async function computeLegalAidFunnel(jurisdictionIds) {
  const { rows } = await pool.query(
    `select lar.status, count(*) as count
     from legal_aid_requests lar
     join users u on u.user_id = lar.user_id
     where u.jurisdiction_id = any($1::uuid[])
     group by lar.status`,
    [jurisdictionIds]
  );
  const countByStatus = new Map(rows.map((r) => [r.status, Number(r.count)]));
  const totalCount = rows.reduce((sum, r) => sum + Number(r.count), 0);
  return {
    totalCount,
    stages: LEGAL_AID_STATUSES.map((status) => ({ status, count: countByStatus.get(status) || 0 })),
  };
}

// Per-child rollup - one row per district/state, same shape the Report's
// own computePerChildRollups already uses for every other Section A metric.
async function countLegalAidFunnelByGroup(jurisdictionIds, groupByParent) {
  const groupExpr = groupByParent ? 'j.parent_id' : 'u.jurisdiction_id';
  const { rows } = await pool.query(
    `select ${groupExpr} as group_id, lar.status, count(*) as count
     from legal_aid_requests lar
     join users u on u.user_id = lar.user_id
     join jurisdictions j on j.jurisdiction_id = u.jurisdiction_id
     where u.jurisdiction_id = any($1::uuid[])
     group by ${groupExpr}, lar.status`,
    [jurisdictionIds]
  );
  const byGroup = new Map();
  for (const r of rows) {
    if (!byGroup.has(r.group_id)) byGroup.set(r.group_id, new Map());
    byGroup.get(r.group_id).set(r.status, Number(r.count));
  }
  return byGroup;
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

// ===== Additional real data categories (comprehensive coverage pass) =====
// Each verified against schema.sql/live data before being built - see this
// file's own module comment history. wellness_content engagement was
// explicitly investigated and skipped (no per-user usage/view-tracking
// column or table exists anywhere in this codebase - wellness_content is
// only ever read as a static catalog, never logged as "viewed" by a user -
// confirmed via grep across every route before deciding not to build it).

// All 3 tiers via the same function - a current-state snapshot (not
// period-scoped, same reasoning as caseTypeDistribution). Single aggregate
// across the given jurisdictionIds, not per-child (a 6-language breakdown
// per child district would be unreadable clutter at State/National scale).
async function computeLanguagePreferences(jurisdictionIds) {
  const [{ rows: langRows }, { rows: prefRows }] = await Promise.all([
    pool.query(
      `select l.name as language_name, count(*) as count
       from users u
       left join languages l on l.language_id = u.preferred_language
       where u.jurisdiction_id = any($1::uuid[])
       group by l.name
       order by count(*) desc`,
      [jurisdictionIds]
    ),
    pool.query(
      `select count(*) filter (where opted_for_manual_counsellor) as manual_count,
              count(*) as total
       from users
       where jurisdiction_id = any($1::uuid[])`,
      [jurisdictionIds]
    ),
  ]);
  const languageDistribution = langRows.map((r) => ({ languageName: r.language_name || 'Not Set', count: Number(r.count) }));
  const p = prefRows[0];
  return {
    languageDistribution,
    optedForManualCounsellorCount: Number(p.manual_count),
    totalCases: Number(p.total),
  };
}

// All 3 tiers via the same function - a current-state compliance snapshot.
// consent_records is per (user, channel), so "has consent on file" means at
// least one non-revoked row for that user; joined directly on u.user_id
// (not coalesced through linked_to_user_id) - consent is a channel-specific
// grant simulated data hasn't needed to model at the anchor level, and the
// base `cases` table already lists a dependent case as its own row the same
// direct way.
async function computeConsentCompliance(jurisdictionIds) {
  const { rows } = await pool.query(
    `select count(distinct u.user_id) as total,
            count(distinct cr.user_id) as with_consent
     from users u
     left join consent_records cr on cr.user_id = u.user_id and cr.revoked_at is null
     where u.jurisdiction_id = any($1::uuid[])`,
    [jurisdictionIds]
  );
  const total = Number(rows[0].total);
  const withConsent = Number(rows[0].with_consent);
  return {
    totalCases: total,
    withConsent,
    withoutConsent: total - withConsent,
    compliancePct: total > 0 ? Math.round((withConsent / total) * 100) : null,
  };
}

// ===== Case-Type Spike Alert (all 3 tiers) =====
// Compares THIS report's new-enrollment count per case type against the
// immediately-preceding period of equal length, for the same jurisdiction
// set - reuses the exact same users.enrolled_at/case_type_id shape as
// computeNewEnrollments/computeCaseTypeDistribution, just for one
// additional prior-period query. Meant to be the "read this first" section
// (rendered as a callout right after the cover page, not buried at the
// end) - a busy official should see an anomaly before the routine tables.
//
// Threshold (documented judgment call, same spirit as TREND_FLAT_THRESHOLD
// above): flagged only when a case type grew by at least +50% AND by at
// least 2 more actual cases, so "1 case became 2" (a mathematically
// enormous +100%) doesn't read as a dramatic spike on noise-level counts. A
// brand-new case type this period (0 -> N, N >= 2) is flagged with
// percentChange: null (a percentage off a zero base isn't meaningful) -
// the PDF renders that case as "N new case(s) (previously none)" instead of
// a percentage.
const SPIKE_MIN_PERCENT = 50;
const SPIKE_MIN_ABSOLUTE_INCREASE = 2;

// childContext (State/National only): { children, groupByParent } - when
// given, also identifies WHICH child jurisdiction drove each flagged spike
// (the child with the largest INCREASE for that case type), so the callout
// reads as "...driven mainly by Pune" rather than just a subtree-wide
// number - what actually makes an alert actionable for policy. Two extra
// grouped queries (current/prior per-child-per-type), only run when
// childContext is passed (District has no children, so it never pays this
// cost).
async function computeSpikeAlerts(jurisdictionIds, periodStart, periodEnd, childContext = null) {
  const periodMs = periodEnd.getTime() - periodStart.getTime();
  const priorEnd = new Date(periodStart.getTime());
  const priorStart = new Date(periodStart.getTime() - periodMs);

  const [{ rows: currentRows }, { rows: priorRows }] = await Promise.all([
    pool.query(
      `select ct.name, count(*) as count
       from users u join case_types ct on ct.case_type_id = u.case_type_id
       where u.jurisdiction_id = any($1::uuid[]) and u.enrolled_at >= $2 and u.enrolled_at <= $3
       group by ct.name`,
      [jurisdictionIds, periodStart.toISOString(), periodEnd.toISOString()]
    ),
    // Half-open [priorStart, priorEnd) so a case enrolled exactly at
    // periodStart is never double-counted into both windows.
    pool.query(
      `select ct.name, count(*) as count
       from users u join case_types ct on ct.case_type_id = u.case_type_id
       where u.jurisdiction_id = any($1::uuid[]) and u.enrolled_at >= $2 and u.enrolled_at < $3
       group by ct.name`,
      [jurisdictionIds, priorStart.toISOString(), priorEnd.toISOString()]
    ),
  ]);

  const currentByType = new Map(currentRows.map((r) => [r.name, Number(r.count)]));
  const priorByType = new Map(priorRows.map((r) => [r.name, Number(r.count)]));

  const alerts = [];
  for (const [caseTypeName, currentCount] of currentByType.entries()) {
    const previousCount = priorByType.get(caseTypeName) || 0;
    const increase = currentCount - previousCount;
    if (increase < SPIKE_MIN_ABSOLUTE_INCREASE) continue;

    if (previousCount === 0) {
      alerts.push({ caseTypeName, previousCount, currentCount, percentChange: null });
      continue;
    }
    const percentChange = Math.round((increase / previousCount) * 100);
    if (percentChange >= SPIKE_MIN_PERCENT) {
      alerts.push({ caseTypeName, previousCount, currentCount, percentChange });
    }
  }

  alerts.sort((a, b) => b.currentCount - a.currentCount);

  if (alerts.length > 0 && childContext) {
    const { children, groupByParent } = childContext;
    const groupExpr = groupByParent ? 'j.parent_id' : 'u.jurisdiction_id';
    const [{ rows: currentByChild }, { rows: priorByChild }] = await Promise.all([
      pool.query(
        `select ${groupExpr} as group_id, ct.name as case_type_name, count(*) as count
         from users u join case_types ct on ct.case_type_id = u.case_type_id
         join jurisdictions j on j.jurisdiction_id = u.jurisdiction_id
         where u.jurisdiction_id = any($1::uuid[]) and u.enrolled_at >= $2 and u.enrolled_at <= $3
         group by ${groupExpr}, ct.name`,
        [jurisdictionIds, periodStart.toISOString(), periodEnd.toISOString()]
      ),
      pool.query(
        `select ${groupExpr} as group_id, ct.name as case_type_name, count(*) as count
         from users u join case_types ct on ct.case_type_id = u.case_type_id
         join jurisdictions j on j.jurisdiction_id = u.jurisdiction_id
         where u.jurisdiction_id = any($1::uuid[]) and u.enrolled_at >= $2 and u.enrolled_at < $3
         group by ${groupExpr}, ct.name`,
        [jurisdictionIds, priorStart.toISOString(), priorEnd.toISOString()]
      ),
    ]);

    const nameByChildId = new Map(children.map((c) => [c.jurisdiction_id, c.name]));
    // key: `${childId}::${caseTypeName}` -> count
    const currentByChildType = new Map(currentByChild.map((r) => [`${r.group_id}::${r.case_type_name}`, Number(r.count)]));
    const priorByChildType = new Map(priorByChild.map((r) => [`${r.group_id}::${r.case_type_name}`, Number(r.count)]));

    for (const alert of alerts) {
      let drivingChildId = null;
      let drivingIncrease = -Infinity;
      for (const child of children) {
        const key = `${child.jurisdiction_id}::${alert.caseTypeName}`;
        const childIncrease = (currentByChildType.get(key) || 0) - (priorByChildType.get(key) || 0);
        if (childIncrease > drivingIncrease) {
          drivingIncrease = childIncrease;
          drivingChildId = child.jurisdiction_id;
        }
      }
      // Only attribute a driving child when it actually contributed a real
      // increase (>0) - a flat/negative "max" (every child unchanged) means
      // no single child explains the spike, so leave it unattributed rather
      // than naming an arbitrary child that didn't actually grow.
      alert.drivingJurisdictionName = drivingIncrease > 0 ? nameByChildId.get(drivingChildId) || null : null;
    }
  }

  return alerts;
}

// ===== Per-child rollup helpers (State: one row per child district;
// National: one row per child state) =====
// User direction: every kind of data belongs at EVERY tier - only the
// GRANULARITY changes (District = its own case-level/current-state detail;
// State/National = one row per child, same groupByParent trick
// countRiskByGroup already established). Each of these mirrors a District-
// tier section 1:1, just grouped by child instead of scoped to one district.

// Case Stage Distribution rollup - case_stage is a fixed 5-value enum, so a
// per-child column-per-stage table is bounded/readable (unlike a per-child
// column-per-CASE-TYPE table, which is 9 columns and growing - see
// countTopCaseTypeByGroup below for why that one takes a different shape).
async function countCaseStageByGroup(jurisdictionIds, groupByParent) {
  const groupExpr = groupByParent ? 'j.parent_id' : 'u.jurisdiction_id';
  const { rows } = await pool.query(
    `select ${groupExpr} as group_id,
            count(*) filter (where u.case_stage = 'Investigation') as investigation,
            count(*) filter (where u.case_stage = 'Trial') as trial,
            count(*) filter (where u.case_stage = 'Rehabilitation') as rehabilitation,
            count(*) filter (where u.case_stage = 'Compensation') as compensation,
            count(*) filter (where u.case_stage = 'Case Closed') as case_closed
     from users u
     join jurisdictions j on j.jurisdiction_id = u.jurisdiction_id
     where u.jurisdiction_id = any($1::uuid[])
     group by ${groupExpr}`,
    [jurisdictionIds]
  );
  return new Map(rows.map((r) => [r.group_id, r]));
}

// New Enrollments rollup - a COUNT per child, not the full case list (same
// "a count is the right granularity for a rollup" reasoning districts/
// states already use).
async function countNewEnrollmentsByGroup(jurisdictionIds, groupByParent, periodStart, periodEnd) {
  const groupExpr = groupByParent ? 'j.parent_id' : 'u.jurisdiction_id';
  const { rows } = await pool.query(
    `select ${groupExpr} as group_id, count(*) as count
     from users u
     join jurisdictions j on j.jurisdiction_id = u.jurisdiction_id
     where u.jurisdiction_id = any($1::uuid[]) and u.enrolled_at >= $2 and u.enrolled_at <= $3
     group by ${groupExpr}`,
    [jurisdictionIds, periodStart.toISOString(), periodEnd.toISOString()]
  );
  return new Map(rows.map((r) => [r.group_id, Number(r.count)]));
}

// Alert Volume rollup - same 3-state breakdown as District's own
// computeAlertVolume, one row per child instead of one object for a single
// district.
async function countAlertVolumeByGroup(jurisdictionIds, groupByParent, periodStart, periodEnd) {
  const groupExpr = groupByParent ? 'j.parent_id' : 'u.jurisdiction_id';
  const { rows } = await pool.query(
    `select ${groupExpr} as group_id,
            count(*) filter (where ast.name = 'Open') as open_count,
            count(*) filter (where ast.name = 'Acknowledged') as ack_count,
            count(*) filter (where ast.name = 'Resolved') as resolved_count
     from alerts a
     join users u on u.user_id = a.user_id
     join jurisdictions j on j.jurisdiction_id = u.jurisdiction_id
     join alert_statuses ast on ast.alert_status_id = a.alert_status_id
     where u.jurisdiction_id = any($1::uuid[]) and a.triggered_at >= $2 and a.triggered_at <= $3
     group by ${groupExpr}`,
    [jurisdictionIds, periodStart.toISOString(), periodEnd.toISOString()]
  );
  return new Map(rows.map((r) => [r.group_id, r]));
}

// Intervention Summary rollup - grouped by child AND type (a real, if
// slightly bigger, breakdown - "what was provided, and to how many users" is
// the whole point of this section, so collapsing type away at State/National
// would report a plain instance count as if it meant something on its own).
// Each child's row card holds its own type list, so this doesn't render as
// a full child x type MATRIX - just as many lines as that child actually has
// intervention types for.
async function countInterventionSummaryByGroup(jurisdictionIds, groupByParent, periodStart, periodEnd) {
  const groupExpr = groupByParent ? 'j.parent_id' : 'u.jurisdiction_id';
  const { rows } = await pool.query(
    `select ${groupExpr} as group_id,
            it.name as type_name,
            count(*) as total_count,
            count(*) filter (where i.completed_at is not null) as completed_count
     from interventions i
     join users u on u.user_id = i.user_id
     join jurisdictions j on j.jurisdiction_id = u.jurisdiction_id
     join intervention_types it on it.intervention_type_id = i.intervention_type_id
     where u.jurisdiction_id = any($1::uuid[]) and i.recommended_at >= $2 and i.recommended_at <= $3
     group by ${groupExpr}, it.name
     order by ${groupExpr}, count(*) desc`,
    [jurisdictionIds, periodStart.toISOString(), periodEnd.toISOString()]
  );
  const byGroup = new Map();
  for (const r of rows) {
    if (!byGroup.has(r.group_id)) byGroup.set(r.group_id, []);
    const totalCount = Number(r.total_count);
    const completedCount = Number(r.completed_count);
    byGroup.get(r.group_id).push({ typeName: r.type_name, totalCount, completedCount, notCompletedCount: totalCount - completedCount });
  }
  return byGroup;
}

// Legal Proceedings (incl. pendency aging) rollup - the aging buckets are
// computed directly in SQL via interval comparisons against now(), grouped
// per child, rather than post-processed in JS (which is how District's own
// version does it per-row) - this avoids fetching every court_case_details
// row across a whole subtree just to bucket them in JS. A child genuinely
// showing 0 here is a real zero (not omitted) - per-CHILD rollup rows are
// always zero-filled, unlike District's own single-jurisdiction section
// which suppresses an all-zero aging breakdown when there's truly nothing
// to bucket (a different rule for a different granularity).
async function countLegalProceedingsByGroup(jurisdictionIds, groupByParent) {
  const groupExpr = groupByParent ? 'j.parent_id' : 'u.jurisdiction_id';
  const { rows } = await pool.query(
    `select ${groupExpr} as group_id,
            count(*) as cases_with_record,
            count(*) filter (where ccd.case_status = 'Pending') as pending_count,
            count(*) filter (where ccd.case_status = 'Disposed') as disposed_count,
            count(*) filter (where ccd.case_status = 'Pending' and ccd.filing_date is not null and (now() - ccd.filing_date) < interval '3 months') as aging_lt_3,
            count(*) filter (where ccd.case_status = 'Pending' and ccd.filing_date is not null and (now() - ccd.filing_date) >= interval '3 months' and (now() - ccd.filing_date) < interval '6 months') as aging_3_6,
            count(*) filter (where ccd.case_status = 'Pending' and ccd.filing_date is not null and (now() - ccd.filing_date) >= interval '6 months' and (now() - ccd.filing_date) < interval '1 year') as aging_6_12,
            count(*) filter (where ccd.case_status = 'Pending' and ccd.filing_date is not null and (now() - ccd.filing_date) >= interval '1 year') as aging_gt_1y
     from court_case_details ccd
     join users u on u.user_id = ccd.user_id
     join jurisdictions j on j.jurisdiction_id = u.jurisdiction_id
     where u.jurisdiction_id = any($1::uuid[])
     group by ${groupExpr}`,
    [jurisdictionIds]
  );
  return new Map(rows.map((r) => [r.group_id, r]));
}

// Alert & SOS Response Times rollup - a single grouped query over raw
// sos_events rows (not an average-of-averages of District-level results) so
// AVG()/count() are true weighted aggregates even when a state's group rolls
// up many districts' worth of individual SOS events at once.
async function countResponseTimesByGroup(jurisdictionIds, groupByParent, periodStart, periodEnd) {
  const groupExpr = groupByParent ? 'j.parent_id' : 'u.jurisdiction_id';
  const { rows } = await pool.query(
    `select ${groupExpr} as group_id,
            count(*) as total,
            count(*) filter (where se.resolved_at is null) as open_count,
            avg(extract(epoch from (se.acknowledged_at - se.triggered_at)) / 60) filter (where se.acknowledged_at is not null) as avg_ack_minutes,
            avg(extract(epoch from (se.resolved_at - se.triggered_at)) / 60) filter (where se.resolved_at is not null) as avg_resolve_minutes
     from sos_events se
     join users u on u.user_id = se.user_id
     join jurisdictions j on j.jurisdiction_id = u.jurisdiction_id
     where u.jurisdiction_id = any($1::uuid[]) and se.triggered_at >= $2 and se.triggered_at <= $3
     group by ${groupExpr}`,
    [jurisdictionIds, periodStart.toISOString(), periodEnd.toISOString()]
  );
  return new Map(rows.map((r) => [r.group_id, r]));
}

// ===== Per-child rollups for the 4 new-role sections above =====

// Investigation Progress rollup - accused_status is a small fixed enum (4
// values, threatAssessment.js's own ACCUSED_STATUSES), so a per-child
// column-per-status table is bounded/readable, same reasoning
// countCaseStageByGroup already gives for its own 5 fixed columns.
async function countInvestigationProgressByGroup(jurisdictionIds, groupByParent) {
  const groupExpr = groupByParent ? 'j.parent_id' : 'u.jurisdiction_id';
  const { rows } = await pool.query(
    `select ${groupExpr} as group_id,
            count(ir.investigation_id) as cases_with_record,
            count(*) filter (where ir.accused_status = 'In Custody') as in_custody,
            count(*) filter (where ir.accused_status = 'Out on Bail') as out_on_bail,
            count(*) filter (where ir.accused_status = 'Absconding') as absconding,
            count(*) filter (where ir.accused_status = 'Convicted') as convicted,
            count(*) filter (where ir.chargesheet_status = 'Filed') as chargesheet_filed,
            count(*) filter (where ir.fir_document_path is not null) as fir_doc_count,
            count(*) filter (where ir.chargesheet_document_path is not null) as chargesheet_doc_count
     from users u
     left join investigation_records ir on ir.user_id = u.user_id
     join jurisdictions j on j.jurisdiction_id = u.jurisdiction_id
     where u.jurisdiction_id = any($1::uuid[])
     group by ${groupExpr}`,
    [jurisdictionIds]
  );
  return new Map(rows.map((r) => [r.group_id, r]));
}

// Threat & Protection rollup - Threat Tier can't be bucketed in SQL (it's
// computeThreatTier, a JS function, not a stored column - see
// computeThreatProtectionSummary above for why) so this fetches every
// matching referral ONCE across the whole subtree (with its own child group
// id attached) and buckets per child in JS, same "some things need JS
// aggregation, not pure SQL" precedent computeCounsellorSection/
// computeSpikeAlerts already set in this file.
async function countThreatProtectionByGroup(jurisdictionIds, groupByParent, periodStart, periodEnd) {
  const groupExpr = groupByParent ? 'j.parent_id' : 'u.jurisdiction_id';
  const { rows } = await pool.query(
    `select ${groupExpr} as group_id, ar.status, ar.metadata, ar.user_id, ir.accused_status, ct.name as case_type_name
     from agency_referrals ar
     join users u on u.user_id = ar.user_id
     join case_types ct on ct.case_type_id = u.case_type_id
     join jurisdictions j on j.jurisdiction_id = u.jurisdiction_id
     left join investigation_records ir on ir.user_id = ar.user_id
     where ar.referred_to_role = 'Protection Officer' and u.jurisdiction_id = any($1::uuid[])
       and ar.created_at >= $2 and ar.created_at <= $3`,
    [jurisdictionIds, periodStart.toISOString(), periodEnd.toISOString()]
  );
  if (rows.length === 0) return new Map();

  const sosCounts = await getSosEventCounts(rows.map((r) => r.user_id), 7);
  const byGroup = new Map();
  for (const r of rows) {
    if (!byGroup.has(r.group_id)) byGroup.set(r.group_id, { totalReferrals: 0, resolvedCount: 0, tierCounts: new Map() });
    const bucket = byGroup.get(r.group_id);
    bucket.totalReferrals += 1;
    if (r.status === 'Resolved') bucket.resolvedCount += 1;
    const tier = computeThreatTier({ accusedStatus: r.accused_status, caseTypeName: r.case_type_name, sosEventCount7d: sosCounts[r.user_id] || 0 });
    const tierLabel = r.metadata?.manualThreatTier || tier || 'Not yet assessed';
    bucket.tierCounts.set(tierLabel, (bucket.tierCounts.get(tierLabel) || 0) + 1);
  }
  return byGroup;
}

// Compensation & Relief rollup - metadata is jsonb, parsed the same way
// computeCompensationReliefSummary does for District, just fetched once
// across the whole subtree (with its group id attached) and reduced per
// child in JS. bank_account_number is read ONLY as `is not null` here too.
async function countCompensationReliefByGroup(jurisdictionIds, groupByParent) {
  const groupExpr = groupByParent ? 'j.parent_id' : 'u.jurisdiction_id';
  const { rows } = await pool.query(
    `select ${groupExpr} as group_id, ar.metadata, ar.status, ar.created_at, (ui.bank_account_number is not null) as has_bank_details
     from agency_referrals ar
     join users u on u.user_id = ar.user_id
     join jurisdictions j on j.jurisdiction_id = u.jurisdiction_id
     left join user_identity ui on ui.user_id = coalesce(u.linked_to_user_id, u.user_id)
     where ar.referred_to_role = 'District Welfare Officer' and u.jurisdiction_id = any($1::uuid[])`,
    [jurisdictionIds]
  );
  if (rows.length === 0) return new Map();

  const byGroup = new Map();
  for (const r of rows) {
    if (!byGroup.has(r.group_id)) {
      byGroup.set(r.group_id, { totalCases: 0, reliefOverdueCount: 0, compensationVerifiedCount: 0, compensationStagesTotal: 0, compensationStagesPaid: 0, bankDetailsOnFileCount: 0 });
    }
    const bucket = byGroup.get(r.group_id);
    bucket.totalCases += 1;

    const relief = r.metadata?.immediateRelief;
    const reliefStatus = relief?.status || 'Not Requested';
    if (reliefStatus === 'Not Requested' || reliefStatus === 'Requested') {
      const daysOpen = (Date.now() - new Date(r.created_at).getTime()) / 86400000;
      if (daysOpen > IMMEDIATE_RELIEF_COMPLIANCE_DAYS) bucket.reliefOverdueCount += 1;
    }

    const compensation = r.metadata?.compensation;
    if (compensation?.verifiedAt) {
      bucket.compensationVerifiedCount += 1;
      const stages = compensation.stages || [];
      bucket.compensationStagesTotal += stages.length;
      bucket.compensationStagesPaid += stages.filter((s) => s.status === 'Paid').length;
    }

    if (r.has_bank_details) bucket.bankDetailsOnFileCount += 1;
  }
  return byGroup;
}

// Agency Referral Volume rollup - pure grouped SQL, same shape as
// countInterventionSummaryByGroup, just keyed by referred_to_role instead
// of intervention type.
async function countAgencyReferralVolumeByGroup(jurisdictionIds, groupByParent, periodStart, periodEnd) {
  const groupExpr = groupByParent ? 'j.parent_id' : 'u.jurisdiction_id';
  const { rows } = await pool.query(
    `select ${groupExpr} as group_id, ar.referred_to_role as role_name,
            count(*) as total_count,
            count(*) filter (where ar.status = 'Resolved') as resolved_count,
            avg(extract(epoch from (ar.resolved_at - ar.created_at)) / 86400) filter (where ar.resolved_at is not null) as avg_resolve_days
     from agency_referrals ar
     join users u on u.user_id = ar.user_id
     join jurisdictions j on j.jurisdiction_id = u.jurisdiction_id
     where u.jurisdiction_id = any($1::uuid[]) and ar.created_at >= $2 and ar.created_at <= $3
     group by ${groupExpr}, ar.referred_to_role
     order by ${groupExpr}, count(*) desc`,
    [jurisdictionIds, periodStart.toISOString(), periodEnd.toISOString()]
  );
  const byGroup = new Map();
  for (const r of rows) {
    if (!byGroup.has(r.group_id)) byGroup.set(r.group_id, []);
    const totalCount = Number(r.total_count);
    const resolvedCount = Number(r.resolved_count);
    byGroup.get(r.group_id).push({
      roleName: r.role_name,
      totalCount,
      resolvedCount,
      openCount: totalCount - resolvedCount,
      avgResolveDays: r.avg_resolve_days !== null ? Math.round(Number(r.avg_resolve_days) * 10) / 10 : null,
    });
  }
  return byGroup;
}

// Extends Case Type Distribution (already a whole-subtree aggregate table)
// with the single most common case type PER CHILD, attached to the
// districts/states comparison row - a full child x case-type matrix (9+
// columns and growing) would be unreadable at State/National scale, so this
// is the "extend it without a huge redesign" version: one extra column
// naming each child's own top case type, not a whole second wide table.
async function countTopCaseTypeByGroup(jurisdictionIds, groupByParent) {
  const groupExpr = groupByParent ? 'j.parent_id' : 'u.jurisdiction_id';
  const { rows } = await pool.query(
    `select ${groupExpr} as group_id, ct.name as case_type_name, count(*) as count
     from users u
     join case_types ct on ct.case_type_id = u.case_type_id
     join jurisdictions j on j.jurisdiction_id = u.jurisdiction_id
     where u.jurisdiction_id = any($1::uuid[])
     group by ${groupExpr}, ct.name`,
    [jurisdictionIds]
  );
  const byGroup = new Map();
  for (const r of rows) {
    const current = byGroup.get(r.group_id);
    const count = Number(r.count);
    if (!current || count > current.count) byGroup.set(r.group_id, { name: r.case_type_name, count });
  }
  return byGroup;
}

// Distress Trend's per-child companion - a single current-period average
// score per child, attached to the districts/states comparison row (a full
// per-child trend LINE would need a multi-line/small-multiples chart, real
// added complexity the user explicitly said isn't needed - this single
// number is the cheap, high-value version of "see each child's current
// distress level at a glance").
async function computeAvgScoreForPeriod(jurisdictionIds, periodStart, periodEnd) {
  const { rows } = await pool.query(
    `select avg(ds.score_value) as avg_score
     from distress_scores ds
     join users u on coalesce(u.linked_to_user_id, u.user_id) = ds.user_id
     where u.jurisdiction_id = any($1::uuid[]) and ds.computed_at >= $2 and ds.computed_at <= $3`,
    [jurisdictionIds, periodStart.toISOString(), periodEnd.toISOString()]
  );
  const avg = rows[0].avg_score;
  return avg !== null ? Math.round(Number(avg) * 10) / 10 : null;
}

// Shared by computeDistrictWiseSnapshot (State) and computeStateWiseSnapshot
// (National) - builds every per-child rollup section at once (one shared
// function, not duplicated per tier, same "reportSnapshot.js is shared code"
// reasoning as the rest of this file). `zeroFilledBaseRows` is the
// already-built totalCases/riskLevel row per child (from zeroFillRow) -
// this attaches trendDirection/avgScore/topCaseType onto THOSE rows and
// returns every OTHER section as its own separate per-child array, same key
// names as their District-tier counterparts (the PDF builder tells the two
// shapes apart via `tier`/Array.isArray).
async function computePerChildRollups(children, allDescendantIds, groupByParent, periodStart, periodEnd, zeroFilledBaseRows) {
  const [
    caseStageByGroup,
    newEnrollmentsByGroup,
    alertVolumeByGroup,
    interventionSummaryByGroup,
    legalProceedingsByGroup,
    responseTimesByGroup,
    topCaseTypeByGroup,
    investigationProgressByGroup,
    threatProtectionByGroup,
    compensationReliefByGroup,
    agencyReferralVolumeByGroup,
    perChildExtras,
  ] = await Promise.all([
    countCaseStageByGroup(allDescendantIds, groupByParent),
    countNewEnrollmentsByGroup(allDescendantIds, groupByParent, periodStart, periodEnd),
    countAlertVolumeByGroup(allDescendantIds, groupByParent, periodStart, periodEnd),
    countInterventionSummaryByGroup(allDescendantIds, groupByParent, periodStart, periodEnd),
    countLegalProceedingsByGroup(allDescendantIds, groupByParent),
    countResponseTimesByGroup(allDescendantIds, groupByParent, periodStart, periodEnd),
    countTopCaseTypeByGroup(allDescendantIds, groupByParent),
    countInvestigationProgressByGroup(allDescendantIds, groupByParent),
    countThreatProtectionByGroup(allDescendantIds, groupByParent, periodStart, periodEnd),
    countCompensationReliefByGroup(allDescendantIds, groupByParent),
    countAgencyReferralVolumeByGroup(allDescendantIds, groupByParent, periodStart, periodEnd),
    // Per-child sub-calls that need each child's OWN descendant subtree walk
    // (trend direction, current avg score, counsellor rollup) - can't be
    // expressed as a single SQL group-by the way the others above are.
    // Parallelized ACROSS children (not sequential) - same pattern the old
    // trend-direction-only pass already used, just now also carrying
    // avgScore/counsellors in the same per-child round trip.
    Promise.all(children.map(async (c) => {
      const childDescendants = await getDescendantJurisdictionIds(c.jurisdiction_id);
      const [trendDirection, avgScore, counsellorsRaw] = await Promise.all([
        computeTrendDirection(childDescendants),
        computeAvgScoreForPeriod(childDescendants, periodStart, periodEnd),
        computeCounsellorSection(childDescendants),
      ]);
      return { jurisdictionId: c.jurisdiction_id, trendDirection, avgScore, counsellorRollup: aggregateCounsellorRollup(counsellorsRaw) };
    })),
  ]);

  const extrasById = new Map(perChildExtras.map((e) => [e.jurisdictionId, e]));

  const rows = zeroFilledBaseRows.map((row) => {
    const extra = extrasById.get(row.jurisdictionId);
    const topCaseType = topCaseTypeByGroup.get(row.jurisdictionId) || null;
    return { ...row, trendDirection: extra.trendDirection, avgScore: extra.avgScore, topCaseType };
  });

  const caseStageDistribution = children.map((c) => {
    const r = caseStageByGroup.get(c.jurisdiction_id);
    return {
      jurisdictionId: c.jurisdiction_id,
      name: c.name,
      investigation: r ? Number(r.investigation) : 0,
      trial: r ? Number(r.trial) : 0,
      rehabilitation: r ? Number(r.rehabilitation) : 0,
      compensation: r ? Number(r.compensation) : 0,
      caseClosed: r ? Number(r.case_closed) : 0,
    };
  });

  const newEnrollments = children.map((c) => ({
    jurisdictionId: c.jurisdiction_id,
    name: c.name,
    newEnrollmentCount: newEnrollmentsByGroup.get(c.jurisdiction_id) || 0,
  }));

  const alertVolume = children.map((c) => {
    const r = alertVolumeByGroup.get(c.jurisdiction_id);
    const open = r ? Number(r.open_count) : 0;
    const acknowledged = r ? Number(r.ack_count) : 0;
    const resolved = r ? Number(r.resolved_count) : 0;
    return { jurisdictionId: c.jurisdiction_id, name: c.name, open, acknowledged, resolved, total: open + acknowledged + resolved };
  });

  const interventionSummary = children.map((c) => {
    const types = interventionSummaryByGroup.get(c.jurisdiction_id) || [];
    const totalCount = types.reduce((sum, t) => sum + t.totalCount, 0);
    const completedCount = types.reduce((sum, t) => sum + t.completedCount, 0);
    return { jurisdictionId: c.jurisdiction_id, name: c.name, types, totalCount, completedCount, notCompletedCount: totalCount - completedCount };
  });

  const legalProceedings = children.map((c) => {
    const r = legalProceedingsByGroup.get(c.jurisdiction_id);
    return {
      jurisdictionId: c.jurisdiction_id,
      name: c.name,
      casesWithRecord: r ? Number(r.cases_with_record) : 0,
      pendingCount: r ? Number(r.pending_count) : 0,
      disposedCount: r ? Number(r.disposed_count) : 0,
      agingLt3: r ? Number(r.aging_lt_3) : 0,
      aging3to6: r ? Number(r.aging_3_6) : 0,
      aging6to12: r ? Number(r.aging_6_12) : 0,
      agingGt1y: r ? Number(r.aging_gt_1y) : 0,
    };
  });

  const responseTimes = children.map((c) => {
    const r = responseTimesByGroup.get(c.jurisdiction_id);
    return {
      jurisdictionId: c.jurisdiction_id,
      name: c.name,
      totalSosCount: r ? Number(r.total) : 0,
      openSosCount: r ? Number(r.open_count) : 0,
      avgAcknowledgeMinutes: r && r.avg_ack_minutes !== null ? Math.round(Number(r.avg_ack_minutes) * 10) / 10 : null,
      avgResolveMinutes: r && r.avg_resolve_minutes !== null ? Math.round(Number(r.avg_resolve_minutes) * 10) / 10 : null,
    };
  });

  const counsellors = children.map((c) => ({
    jurisdictionId: c.jurisdiction_id,
    name: c.name,
    ...extrasById.get(c.jurisdiction_id).counsellorRollup,
  }));

  const investigationProgress = children.map((c) => {
    const r = investigationProgressByGroup.get(c.jurisdiction_id);
    return {
      jurisdictionId: c.jurisdiction_id,
      name: c.name,
      casesWithRecord: r ? Number(r.cases_with_record) : 0,
      inCustody: r ? Number(r.in_custody) : 0,
      outOnBail: r ? Number(r.out_on_bail) : 0,
      absconding: r ? Number(r.absconding) : 0,
      convicted: r ? Number(r.convicted) : 0,
      chargesheetFiled: r ? Number(r.chargesheet_filed) : 0,
      firDocumentOnFileCount: r ? Number(r.fir_doc_count) : 0,
      chargesheetDocumentOnFileCount: r ? Number(r.chargesheet_doc_count) : 0,
    };
  });

  const threatProtection = children.map((c) => {
    const bucket = threatProtectionByGroup.get(c.jurisdiction_id);
    return {
      jurisdictionId: c.jurisdiction_id,
      name: c.name,
      totalReferrals: bucket ? bucket.totalReferrals : 0,
      resolvedCount: bucket ? bucket.resolvedCount : 0,
      threatTierDistribution: bucket ? [...bucket.tierCounts.entries()].map(([tier, count]) => ({ tier, count })) : [],
    };
  });

  const compensationRelief = children.map((c) => {
    const b = compensationReliefByGroup.get(c.jurisdiction_id);
    return {
      jurisdictionId: c.jurisdiction_id,
      name: c.name,
      totalCases: b ? b.totalCases : 0,
      reliefOverdueCount: b ? b.reliefOverdueCount : 0,
      compensationVerifiedCount: b ? b.compensationVerifiedCount : 0,
      compensationStagesTotal: b ? b.compensationStagesTotal : 0,
      compensationStagesPaid: b ? b.compensationStagesPaid : 0,
      bankDetailsOnFileCount: b ? b.bankDetailsOnFileCount : 0,
    };
  });

  const agencyReferralVolume = children.map((c) => {
    const roles = agencyReferralVolumeByGroup.get(c.jurisdiction_id) || [];
    const totalCount = roles.reduce((sum, r) => sum + r.totalCount, 0);
    const resolvedCount = roles.reduce((sum, r) => sum + r.resolvedCount, 0);
    return { jurisdictionId: c.jurisdiction_id, name: c.name, roles, totalCount, resolvedCount, openCount: totalCount - resolvedCount };
  });

  return {
    rows, caseStageDistribution, newEnrollments, alertVolume, interventionSummary, legalProceedings, responseTimes, counsellors,
    investigationProgress, threatProtection, compensationRelief, agencyReferralVolume,
  };
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
    languagePreferences,
    consentCompliance,
    spikeAlerts,
  ] = await Promise.all([
    computeDistressTrendSection([districtJurisdictionId], periodStart, periodEnd, periodType),
    computeCounsellorSection([districtJurisdictionId]),
    computeResponseTimeSection([districtJurisdictionId], periodStart, periodEnd),
    computeCaseTypeDistribution([districtJurisdictionId]),
    computeCaseStageDistribution(districtJurisdictionId),
    computeNewEnrollments(districtJurisdictionId, periodStart, periodEnd),
    computeAlertVolume(districtJurisdictionId, periodStart, periodEnd),
    computeInterventionSummary(districtJurisdictionId, periodStart, periodEnd),
    computeLegalProceedings(districtJurisdictionId, periodStart, periodEnd),
    computeLanguagePreferences([districtJurisdictionId]),
    computeConsentCompliance([districtJurisdictionId]),
    computeSpikeAlerts([districtJurisdictionId], periodStart, periodEnd),
  ]);

  const [investigationProgress, threatProtection, compensationRelief, agencyReferralVolume] = await Promise.all([
    computeInvestigationProgress([districtJurisdictionId]),
    computeThreatProtectionSummary([districtJurisdictionId], periodStart, periodEnd),
    computeCompensationReliefSummary([districtJurisdictionId]),
    computeAgencyReferralVolume([districtJurisdictionId], periodStart, periodEnd),
  ]);

  return {
    tier: 'district',
    summary,
    spikeAlerts,
    cases,
    caseTypeDistribution,
    caseStageDistribution,
    newEnrollments,
    distressTrend,
    alertVolume,
    interventionSummary,
    legalProceedings,
    languagePreferences,
    consentCompliance,
    counsellors,
    responseTimes,
    investigationProgress,
    threatProtection,
    compensationRelief,
    agencyReferralVolume,
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

  const [
    perChildRollups,
    distressTrend,
    caseTypeDistribution,
    reportingCompliance,
    languagePreferences,
    consentCompliance,
    spikeAlerts,
  ] = await Promise.all([
    // Every kind of data belongs at every tier - District's own case-level/
    // current-state sections all get a per-child (one row per district)
    // rollup here, same groupByParent trick countRiskByGroup already uses.
    computePerChildRollups(children, allDescendantIds, false, periodStart, periodEnd, zeroFilledDistricts),
    computeDistressTrendSection(allDescendantIds, periodStart, periodEnd, periodType),
    computeCaseTypeDistribution(allDescendantIds),
    computeReportingCompliance(stateJurisdictionId, periodStart, periodEnd, children),
    computeLanguagePreferences(allDescendantIds),
    computeConsentCompliance(allDescendantIds),
    // Identifies which child district drove each flagged spike, per the
    // "make it actionable for policy" direction.
    computeSpikeAlerts(allDescendantIds, periodStart, periodEnd, { children, groupByParent: false }),
  ]);

  return {
    tier: 'state',
    summary,
    spikeAlerts,
    districts: perChildRollups.rows,
    caseTypeDistribution,
    caseStageDistribution: perChildRollups.caseStageDistribution,
    newEnrollments: perChildRollups.newEnrollments,
    distressTrend,
    alertVolume: perChildRollups.alertVolume,
    interventionSummary: perChildRollups.interventionSummary,
    legalProceedings: perChildRollups.legalProceedings,
    languagePreferences,
    consentCompliance,
    counsellors: perChildRollups.counsellors,
    responseTimes: perChildRollups.responseTimes,
    reportingCompliance,
    investigationProgress: perChildRollups.investigationProgress,
    threatProtection: perChildRollups.threatProtection,
    compensationRelief: perChildRollups.compensationRelief,
    agencyReferralVolume: perChildRollups.agencyReferralVolume,
  };
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

  const [
    perChildRollups,
    distressTrend,
    caseTypeDistribution,
    reportingCompliance,
    languagePreferences,
    consentCompliance,
    spikeAlerts,
  ] = await Promise.all([
    // Same per-child rollup one level up - National's children are states,
    // so groupByParent: true rolls each district up into its own state.
    computePerChildRollups(children, allDescendantIds, true, periodStart, periodEnd, zeroFilledStates),
    computeDistressTrendSection(allDescendantIds, periodStart, periodEnd, periodType),
    computeCaseTypeDistribution(allDescendantIds),
    computeReportingCompliance(nationalJurisdictionId, periodStart, periodEnd, children),
    computeLanguagePreferences(allDescendantIds),
    computeConsentCompliance(allDescendantIds),
    computeSpikeAlerts(allDescendantIds, periodStart, periodEnd, { children, groupByParent: true }),
  ]);

  return {
    tier: 'national',
    summary,
    spikeAlerts,
    states: perChildRollups.rows,
    caseTypeDistribution,
    caseStageDistribution: perChildRollups.caseStageDistribution,
    newEnrollments: perChildRollups.newEnrollments,
    distressTrend,
    alertVolume: perChildRollups.alertVolume,
    interventionSummary: perChildRollups.interventionSummary,
    legalProceedings: perChildRollups.legalProceedings,
    languagePreferences,
    consentCompliance,
    counsellors: perChildRollups.counsellors,
    responseTimes: perChildRollups.responseTimes,
    reportingCompliance,
    investigationProgress: perChildRollups.investigationProgress,
    threatProtection: perChildRollups.threatProtection,
    compensationRelief: perChildRollups.compensationRelief,
    agencyReferralVolume: perChildRollups.agencyReferralVolume,
  };
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
  computeInvestigationProgress,
  computeThreatProtectionSummary,
  computeCompensationReliefSummary,
  computeAgencyReferralVolume,
  computeLegalAidFunnel,
  computeTrendDirection,
  computeReportingCompliance,
  computeLanguagePreferences,
  computeConsentCompliance,
  computeSpikeAlerts,
  aggregateCounsellorRollup,
  countCaseStageByGroup,
  countNewEnrollmentsByGroup,
  countAlertVolumeByGroup,
  countInterventionSummaryByGroup,
  countLegalProceedingsByGroup,
  countResponseTimesByGroup,
  countTopCaseTypeByGroup,
  countInvestigationProgressByGroup,
  countThreatProtectionByGroup,
  countCompensationReliefByGroup,
  countAgencyReferralVolumeByGroup,
  countLegalAidFunnelByGroup,
  computeAvgScoreForPeriod,
  computePerChildRollups,
};
