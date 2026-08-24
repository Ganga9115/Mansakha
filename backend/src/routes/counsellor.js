const express = require('express');
const { supabase } = require('../db/supabaseClient');
const { writeAuditLog } = require('../services/auditLog');
const { verifyToken } = require('../middleware/verifyToken');
const { requireRole } = require('../middleware/requireRole');
const { requireJurisdiction } = require('../middleware/requireJurisdiction');
const { generalApiLimiter } = require('../middleware/rateLimiter');
const { ok, fail } = require('../services/responseEnvelope');
const { isEscalatingTrend } = require('../services/scoring');

const RISK_SORT_ORDER = { Critical: 4, High: 3, Moderate: 2, Low: 1 };

const router = express.Router();

// No standing "assignment" table exists in the schema, so "cases this counsellor
// handles" is scoped by the same jurisdiction model Administration uses.
async function resolveVictimJurisdiction(req) {
  const { data } = await supabase.from('victims').select('jurisdiction_id').eq('victim_id', req.params.victimId).maybeSingle();
  return data ? data.jurisdiction_id : null;
}

router.use(verifyToken);

// The Log Intervention screen needs real intervention_type_id values to submit a
// valid intervention (not just the fixed names) - this is that lookup.
router.get('/intervention-types', requireRole(['Counsellor']), generalApiLimiter, async (req, res) => {
  const { data, error } = await supabase.from('intervention_types').select('intervention_type_id, name').order('name');
  if (error) return fail(res, 'Could not load intervention types', 500);
  return ok(res, { interventionTypes: data || [] });
});

// Dashboard counts computed server-side (not tallied from one paginated /cases
// page client-side, which would be wrong once a jurisdiction has more cases than
// one page) - Screen Inventory's Counsellor Dashboard needs this.
router.get('/dashboard', requireRole(['Counsellor']), generalApiLimiter, async (req, res) => {
  const jurisdictionIds = req.auth.roles.filter((r) => r.roleName === 'Counsellor').map((r) => r.jurisdictionId).filter(Boolean);
  if (jurisdictionIds.length === 0) return ok(res, { total: 0, low: 0, moderate: 0, high: 0, critical: 0 });

  const { data: victims } = await supabase
    .from('victims')
    .select('victim_id, distress_scores(score_value, computed_at, risk_levels(name))')
    .in('jurisdiction_id', jurisdictionIds)
    .order('computed_at', { referencedTable: 'distress_scores', ascending: false });

  const counts = { total: 0, low: 0, moderate: 0, high: 0, critical: 0 };
  for (const v of victims || []) {
    counts.total += 1;
    const riskLevel = v.distress_scores?.[0]?.risk_levels?.name;
    if (riskLevel === 'Low') counts.low += 1;
    if (riskLevel === 'Moderate') counts.moderate += 1;
    if (riskLevel === 'High') counts.high += 1;
    if (riskLevel === 'Critical') counts.critical += 1;
  }
  return ok(res, counts);
});

router.get('/cases', requireRole(['Counsellor']), generalApiLimiter, async (req, res) => {
  const { riskLevel, page = 1 } = req.query;
  const pageSize = 20;
  const offset = (Number(page) - 1) * pageSize;

  const jurisdictionIds = req.auth.roles.filter((r) => r.roleName === 'Counsellor').map((r) => r.jurisdictionId).filter(Boolean);
  if (jurisdictionIds.length === 0) return ok(res, { cases: [], total: 0 });

  // Each victim's CURRENT risk tier is their most recent distress_scores row - not
  // modeled as a denormalized column on `victims`, so this is resolved via the
  // latest score per victim rather than trusting any cached field. Sorting by
  // priority means the whole jurisdiction's cases have to be fetched and sorted
  // in application code before paginating - a DB-level `.range()` would only
  // sort within one already-arbitrary page, not across the whole queue.
  const { data, error } = await supabase
    .from('victims')
    .select('victim_id, case_stage, distress_scores(score_value, computed_at, risk_levels(name))')
    .in('jurisdiction_id', jurisdictionIds)
    .order('computed_at', { referencedTable: 'distress_scores', ascending: false });
  if (error) return fail(res, 'Could not load cases', 500);

  let cases = (data || []).map((v) => {
    const latest = v.distress_scores?.[0];
    return {
      victimId: v.victim_id,
      caseStage: v.case_stage,
      score: latest ? latest.score_value : null,
      riskLevel: latest ? latest.risk_levels.name : null,
    };
  });

  if (riskLevel) cases = cases.filter((c) => c.riskLevel === riskLevel);

  // Sorted by priority (highest risk first), not by recency - a case queue's
  // whole point is surfacing the most urgent cases first.
  cases.sort((a, b) => (RISK_SORT_ORDER[b.riskLevel] || 0) - (RISK_SORT_ORDER[a.riskLevel] || 0));

  const total = cases.length;
  cases = cases.slice(offset, offset + pageSize);

  await writeAuditLog({ officialId: req.auth.officialId, action: 'read', entityType: 'case_list' });

  return ok(res, { cases, total });
});

// Administration gets this GET too (Section 8: District Administration has a
// read-only Case Detail screen) - but NOT the POST intervention route below,
// per Section 4.4's explicit "no intervention action for Administration."
router.get('/cases/:victimId', requireRole(['Counsellor', 'Administration']), generalApiLimiter, requireJurisdiction(resolveVictimJurisdiction), async (req, res) => {
  const { victimId } = req.params;

  const { data: scores } = await supabase
    .from('distress_scores')
    .select('score_id, score_value, computed_at, interaction_id, explanation, suggested_intervention_type_id, intervention_types(name), risk_levels(name)')
    .eq('victim_id', victimId)
    .order('computed_at', { ascending: false })
    .limit(3);

  if (!scores || scores.length === 0) return fail(res, 'No check-ins recorded for this case yet', 404);

  const [latest, previous] = scores;
  // isEscalatingTrend wants oldest-first; `scores` came back newest-first.
  const escalating = scores.length >= 3 && isEscalatingTrend([...scores].reverse().map((s) => s.score_value));

  // Explainability: real signal-level breakdown from that interaction's
  // interaction_signals, not a placeholder - Build Prompt Section 4.4.
  const { data: signals } = await supabase
    .from('interaction_signals')
    .select('value, signal_types(name)')
    .eq('interaction_id', latest.interaction_id);

  const { data: openIntervention } = await supabase
    .from('interventions')
    .select('intervention_id, completed_at')
    .eq('victim_id', victimId)
    .order('recommended_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  await writeAuditLog({ officialId: req.auth.officialId, victimId, action: 'read', entityType: 'case_detail', entityId: victimId });

  // The real 3-point monotonic-rise detector (services/scoring.js,
  // unit-tested) takes priority when there's enough history; the cruder
  // 2-point comparison is only a fallback for a case with just 2 check-ins.
  const trend = previous
    ? (escalating || latest.score_value > previous.score_value ? 'escalating' : 'stable_or_improving')
    : 'insufficient_data';

  return ok(res, {
    score: latest.score_value,
    previousScore: previous ? previous.score_value : null,
    trend,
    riskLevel: latest.risk_levels.name,
    riskFactors: (signals || []).map((s) => ({ signal: s.signal_types.name, value: s.value })),
    explanation: latest.explanation || null,
    suggestedInterventionType: latest.suggested_intervention_type_id
      ? { id: latest.suggested_intervention_type_id, name: latest.intervention_types.name }
      : null,
    interventionStatus: openIntervention ? (openIntervention.completed_at ? 'completed' : 'pending') : 'none',
    interventionId: openIntervention ? openIntervention.intervention_id : null,
  });
});

router.post('/cases/:victimId/intervention', requireRole(['Counsellor']), generalApiLimiter, requireJurisdiction(resolveVictimJurisdiction), async (req, res) => {
  const { victimId } = req.params;
  const { interventionTypeId, notes } = req.body;
  if (!interventionTypeId) return fail(res, 'interventionTypeId is required', 400);

  const { data: openAlert } = await supabase
    .from('alerts')
    .select('alert_id, alert_status_id, alert_statuses(name)')
    .eq('victim_id', victimId)
    .order('triggered_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: intervention, error } = await supabase
    .from('interventions')
    .insert({
      victim_id: victimId,
      alert_id: openAlert ? openAlert.alert_id : null,
      intervention_type_id: interventionTypeId,
      assigned_official_id: req.auth.officialId,
      notes: notes || null,
    })
    .select('intervention_id')
    .single();
  if (error) return fail(res, 'Could not log intervention', 500);

  if (openAlert && openAlert.alert_statuses.name === 'Open') {
    const { data: acknowledgedStatus } = await supabase.from('alert_statuses').select('alert_status_id').eq('name', 'Acknowledged').single();
    await supabase.from('alerts').update({ alert_status_id: acknowledgedStatus.alert_status_id }).eq('alert_id', openAlert.alert_id);
  }

  await writeAuditLog({ officialId: req.auth.officialId, victimId, action: 'create', entityType: 'intervention', entityId: intervention.intervention_id });

  return ok(res, { interventionId: intervention.intervention_id }, null, 201);
});

// interventions.completed_at existed in the schema with no code path that
// ever set it - "AI follow-up tracking" (Section 4.4) had no real mechanism
// behind it until this.
router.patch('/cases/:victimId/intervention/:interventionId/complete', requireRole(['Counsellor']), generalApiLimiter, requireJurisdiction(resolveVictimJurisdiction), async (req, res) => {
  const { victimId, interventionId } = req.params;

  const { data, error } = await supabase
    .from('interventions')
    .update({ completed_at: new Date().toISOString() })
    .eq('intervention_id', interventionId)
    .eq('victim_id', victimId)
    .select('intervention_id')
    .maybeSingle();
  if (error) return fail(res, 'Could not mark intervention complete', 500);
  if (!data) return fail(res, 'Intervention not found for this case', 404);

  await writeAuditLog({ officialId: req.auth.officialId, victimId, action: 'update', entityType: 'intervention', entityId: interventionId });

  return ok(res, null, 'Intervention marked complete');
});

// Case notes - free-text commentary, separate from the structured
// interventions above and from audit_log's read/write record.
router.get('/cases/:victimId/notes', requireRole(['Counsellor', 'Administration']), generalApiLimiter, requireJurisdiction(resolveVictimJurisdiction), async (req, res) => {
  const { victimId } = req.params;
  const { data, error } = await supabase
    .from('case_notes')
    .select('note_id, note_text, created_at, officials(full_name)')
    .eq('victim_id', victimId)
    .order('created_at', { ascending: false });
  if (error) return fail(res, 'Could not load case notes', 500);

  return ok(res, {
    notes: (data || []).map((n) => ({
      noteId: n.note_id, noteText: n.note_text, createdAt: n.created_at, authorName: n.officials.full_name,
    })),
  });
});

router.post('/cases/:victimId/notes', requireRole(['Counsellor']), generalApiLimiter, requireJurisdiction(resolveVictimJurisdiction), async (req, res) => {
  const { victimId } = req.params;
  const { noteText } = req.body;
  if (!noteText || !noteText.trim()) return fail(res, 'noteText is required', 400);

  const { data, error } = await supabase
    .from('case_notes')
    .insert({ victim_id: victimId, official_id: req.auth.officialId, note_text: noteText.trim() })
    .select('note_id')
    .single();
  if (error) return fail(res, 'Could not save note', 500);

  await writeAuditLog({ officialId: req.auth.officialId, victimId, action: 'create', entityType: 'case_note', entityId: data.note_id });

  return ok(res, { noteId: data.note_id }, 'Note added', 201);
});

// Capped, not full-page-UI paginated - this feed is polled every 15s
// (frontend/src/services/hooks.js) and rendered as a live list, not paged
// through by the user, so a fixed recent-N cap is what Section 9's "don't
// load thousands of rows at once" actually calls for here.
router.get('/alerts', requireRole(['Counsellor']), generalApiLimiter, async (req, res) => {
  const { data, error } = await supabase
    .from('alert_notifications')
    .select('alert_id, notified_at, alerts(victim_id, triggered_at, alert_statuses(name))')
    .eq('official_id', req.auth.officialId)
    .order('notified_at', { ascending: false })
    .limit(50);
  if (error) return fail(res, 'Could not load alerts', 500);

  return ok(res, {
    alerts: (data || []).map((n) => ({
      alertId: n.alert_id,
      victimId: n.alerts.victim_id,
      triggeredAt: n.alerts.triggered_at,
      status: n.alerts.alert_statuses.name,
      notifiedAt: n.notified_at,
    })),
  });
});

module.exports = router;
