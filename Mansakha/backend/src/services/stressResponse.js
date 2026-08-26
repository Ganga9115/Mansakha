const { supabase } = require('../db/supabaseClient');
const { enqueueAlertDispatch } = require('./dispatchWorker');

// Shared by applyStressResponse's Critical branch below AND routes/victim.js's
// /sos (both need "which counsellor should this route to when the victim
// hasn't opted for/doesn't have one already assigned"). Picks whichever
// eligible Counsellor in the jurisdiction currently has the fewest active
// assigned cases - a real, queryable proxy (victims.assigned_counsellor_id),
// same "no formal assignment tracking" reasoning routes/admin.js's Workload
// view already uses. Returns null if the jurisdiction has no Counsellor at all.
async function selectLeastLoadedCounsellor(jurisdictionId) {
  const { data: allRoles } = await supabase
    .from('official_roles')
    .select('official_id, roles(role_name)')
    .eq('jurisdiction_id', jurisdictionId)
    .is('revoked_at', null);
  const counsellorIds = (allRoles || []).filter((r) => r.roles.role_name === 'Counsellor').map((r) => r.official_id);
  if (counsellorIds.length === 0) return null;

  const { data: assignedVictims } = await supabase
    .from('victims')
    .select('assigned_counsellor_id')
    .in('assigned_counsellor_id', counsellorIds)
    .eq('status', 'active');
  const countByOfficial = new Map(counsellorIds.map((id) => [id, 0]));
  for (const v of assignedVictims || []) {
    countByOfficial.set(v.assigned_counsellor_id, (countByOfficial.get(v.assigned_counsellor_id) || 0) + 1);
  }
  return counsellorIds.reduce((min, id) => (countByOfficial.get(id) < countByOfficial.get(min) ? id : min), counsellorIds[0]);
}

// Feature Catalog Section 1.5 - Stress-Level Automated Response. Called
// immediately after every distress_scores insert that came from a REAL AI
// analysis (routes/victim.js's /checkin and /chat) - never called for /sos,
// which bypasses AI scoring entirely and writes its own sos_events row +
// alert_notifications directly (see routes/victim.js).
//
// Low is a no-op (existing behavior, unchanged). Moderate/High queue a
// dispatch_queue entry for the worker (services/dispatchWorker.js) to drain
// as a push/message. Critical always creates a real alert (source:
// 'distress_score') - who gets notified and at what priority depends on
// whether the victim has already opted for manual counsellor selection.
async function applyStressResponse(victimId, scoreId, riskLevel) {
  if (riskLevel === 'Low') return { alertId: null };

  if (riskLevel === 'Moderate') {
    const { error } = await supabase.from('dispatch_queue').insert({ kind: 'wellness_push', victim_id: victimId });
    if (error) console.error('applyStressResponse: could not queue wellness_push', error.message);
    return { alertId: null };
  }

  if (riskLevel === 'High') {
    const { error } = await supabase.from('dispatch_queue').insert({ kind: 'ai_proactive_contact', victim_id: victimId });
    if (error) console.error('applyStressResponse: could not queue ai_proactive_contact', error.message);
    return { alertId: null };
  }

  // riskLevel === 'Critical'
  const { data: victim, error: victimError } = await supabase
    .from('victims')
    .select('jurisdiction_id, opted_for_manual_counsellor, assigned_counsellor_id')
    .eq('victim_id', victimId)
    .single();
  if (victimError || !victim) {
    console.error('applyStressResponse: could not load victim for Critical routing', victimError?.message);
    return { alertId: null };
  }

  const { data: openStatus, error: openStatusError } = await supabase.from('alert_statuses').select('alert_status_id').eq('name', 'Open').single();
  if (openStatusError || !openStatus) {
    console.error('applyStressResponse: could not resolve Open alert status', openStatusError?.message);
    return { alertId: null };
  }

  const { data: alert, error: alertError } = await supabase
    .from('alerts')
    .insert({ victim_id: victimId, distress_score_id: scoreId, alert_status_id: openStatus.alert_status_id })
    .select('alert_id')
    .single();
  if (alertError) {
    console.error('applyStressResponse: could not create Critical alert', alertError.message);
    return { alertId: null };
  }

  const recipients = [];

  if (victim.opted_for_manual_counsellor && victim.assigned_counsellor_id) {
    // Already opted in with a counsellor - urgent ping to THAT counsellor,
    // not a re-route to the whole jurisdiction.
    recipients.push({ alert_id: alert.alert_id, official_id: victim.assigned_counsellor_id, source: 'distress_score', priority: 'urgent', auto_assigned: false });
  } else {
    const chosenCounsellorId = await selectLeastLoadedCounsellor(victim.jurisdiction_id);
    if (chosenCounsellorId) {
      await supabase.from('victims').update({ assigned_counsellor_id: chosenCounsellorId }).eq('victim_id', victimId);
      recipients.push({ alert_id: alert.alert_id, official_id: chosenCounsellorId, source: 'distress_score', priority: 'urgent', auto_assigned: true });
    }
  }

  // District Administration still gets visibility into a Critical case
  // regardless of the counsellor-routing branch above - same reasoning as
  // the pre-existing routing every High/Critical alert already had.
  const { data: allRoles } = await supabase
    .from('official_roles')
    .select('official_id, roles(role_name)')
    .eq('jurisdiction_id', victim.jurisdiction_id)
    .is('revoked_at', null);
  const adminIds = (allRoles || []).filter((r) => r.roles.role_name === 'Administration').map((r) => r.official_id);
  for (const officialId of adminIds) {
    recipients.push({ alert_id: alert.alert_id, official_id: officialId, source: 'distress_score', priority: 'normal', auto_assigned: false });
  }

  if (recipients.length > 0) {
    const { error: notifyError } = await supabase.from('alert_notifications').insert(recipients);
    if (notifyError) {
      console.error('applyStressResponse: could not write alert_notifications', notifyError.message);
    } else {
      await enqueueAlertDispatch(alert.alert_id, victimId, recipients.map((r) => r.official_id));
    }
  } else {
    console.error('applyStressResponse: Critical alert created with zero notification recipients', { alertId: alert.alert_id, victimId });
  }

  return { alertId: alert.alert_id };
}

module.exports = { applyStressResponse, selectLeastLoadedCounsellor };
