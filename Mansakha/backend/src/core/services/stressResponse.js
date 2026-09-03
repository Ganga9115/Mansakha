const { supabase } = require('../db/supabaseClient');
const { enqueueAlertDispatch } = require('./dispatchWorker');
const { CASE_STAGE_SCORES, propagateCounsellorAssignment } = require('../../user/services/userProvisioning');

// Multi-Case-Per-Person Support - every jurisdiction the person has an open
// case in, not just the one on the row a Critical alert/SOS happened to fire
// from. anchorUserId is expected to already be resolved (every caller here
// has it from req.auth.userId, always the anchor per auth.user.routes.js's
// login).
async function getJurisdictionIdsForCaseFamily(anchorUserId) {
  const { data: rows } = await supabase
    .from('users')
    .select('jurisdiction_id')
    .or(`user_id.eq.${anchorUserId},linked_to_user_id.eq.${anchorUserId}`);
  return [...new Set((rows || []).map((r) => r.jurisdiction_id).filter(Boolean))];
}

// Shared by applyStressResponse's Critical branch below, user/routes/user.routes.js's
// /urgent-help, and /counsellor-preference (opting in assigns immediately, so a
// chat/call redirect has someone to point to right away). Automated
// counsellor-assignment algorithm, per explicit request - ANY counsellor
// nationwide is eligible (not scoped to the user's own district first):
// a user in Shimla, Himachal Pradesh can land on a counsellor anywhere in
// India, purely based on who's least loaded right now. `jurisdictionId` is
// no longer used to scope eligibility (kept as a parameter for call-site
// compatibility) - every active Counsellor in the system is a candidate.
//
//   1. Primary: whichever eligible Counsellor currently has the fewest
//      ACTIVE assigned cases (case_stage != 'Case Closed'). A closed case no
//      longer counts toward caseload.
//   2. Tie-break (two+ counsellors with the same active count): whichever
//      has the HIGHER sum of case-stage scores (Investigation=1, Trial=2,
//      Rehabilitation=3, Compensation=4, Case Closed=0) across every user
//      currently assigned to them. Closed cases contribute 0 to this sum, so
//      summing "all assigned" vs "active only" gives the identical total -
//      no need to exclude them separately here.
//   3. Still tied after that: first by official_id, for a deterministic pick
//      rather than depending on query row order.
//
// Returns null if there is no Counsellor anywhere in the system.
// eslint-disable-next-line no-unused-vars
async function selectLeastLoadedCounsellor(jurisdictionId) {
  const { data: globalRoles } = await supabase
    .from('official_roles')
    .select('official_id, roles(role_name)')
    .is('revoked_at', null);
  const counsellorIds = (globalRoles || []).filter((r) => r.roles?.role_name === 'Counsellor').map((r) => r.official_id);

  if (counsellorIds.length === 0) return null;
  if (counsellorIds.length === 1) return counsellorIds[0];

  const { data: assignedUsers } = await supabase
    .from('users')
    .select('assigned_counsellor_id, case_stage')
    .in('assigned_counsellor_id', counsellorIds)
    .eq('status', 'active');

  const activeCountByOfficial = new Map(counsellorIds.map((id) => [id, 0]));
  const stageScoreSumByOfficial = new Map(counsellorIds.map((id) => [id, 0]));
  for (const u of assignedUsers || []) {
    stageScoreSumByOfficial.set(
      u.assigned_counsellor_id,
      stageScoreSumByOfficial.get(u.assigned_counsellor_id) + (CASE_STAGE_SCORES[u.case_stage] ?? 0)
    );
    if (u.case_stage !== 'Case Closed') {
      activeCountByOfficial.set(u.assigned_counsellor_id, activeCountByOfficial.get(u.assigned_counsellor_id) + 1);
    }
  }

  const minActiveCount = Math.min(...counsellorIds.map((id) => activeCountByOfficial.get(id)));
  let candidates = counsellorIds.filter((id) => activeCountByOfficial.get(id) === minActiveCount);
  if (candidates.length > 1) {
    const maxScore = Math.max(...candidates.map((id) => stageScoreSumByOfficial.get(id)));
    candidates = candidates.filter((id) => stageScoreSumByOfficial.get(id) === maxScore);
  }
  return candidates.sort()[0];
}

// Feature Catalog Section 1.5 - Stress-Level Automated Response. Called
// immediately after every distress_scores insert that came from a REAL AI
// analysis (user/routes/user.routes.js's /checkin and /chat) - never called for /sos,
// which bypasses AI scoring entirely and writes its own sos_events row +
// alert_notifications directly (see user/routes/user.routes.js).
//
// Low is a no-op (existing behavior, unchanged). Moderate/High queue a
// dispatch_queue entry for the worker (services/dispatchWorker.js) to drain
// as a push/message. Critical always creates a real alert (source:
// 'distress_score') - who gets notified and at what priority depends on
// whether the user has already opted for manual counsellor selection.
async function applyStressResponse(userId, scoreId, riskLevel) {
  if (riskLevel === 'Low') return { alertId: null };

  if (riskLevel === 'Moderate') {
    const { error } = await supabase.from('dispatch_queue').insert({ kind: 'wellness_push', user_id: userId });
    if (error) console.error('applyStressResponse: could not queue wellness_push', error.message);
    return { alertId: null };
  }

  if (riskLevel === 'High') {
    const { error } = await supabase.from('dispatch_queue').insert({ kind: 'ai_proactive_contact', user_id: userId });
    if (error) console.error('applyStressResponse: could not queue ai_proactive_contact', error.message);
    return { alertId: null };
  }

  // riskLevel === 'Critical'
  const { data: user, error: userError } = await supabase
    .from('users')
    .select('jurisdiction_id, opted_for_manual_counsellor, assigned_counsellor_id')
    .eq('user_id', userId)
    .single();
  if (userError || !user) {
    console.error('applyStressResponse: could not load user for Critical routing', userError?.message);
    return { alertId: null };
  }

  const { data: openStatus, error: openStatusError } = await supabase.from('alert_statuses').select('alert_status_id').eq('name', 'Open').single();
  if (openStatusError || !openStatus) {
    console.error('applyStressResponse: could not resolve Open alert status', openStatusError?.message);
    return { alertId: null };
  }

  const { data: alert, error: alertError } = await supabase
    .from('alerts')
    .insert({ user_id: userId, distress_score_id: scoreId, alert_status_id: openStatus.alert_status_id })
    .select('alert_id')
    .single();
  if (alertError) {
    console.error('applyStressResponse: could not create Critical alert', alertError.message);
    return { alertId: null };
  }

  const recipients = [];

  if (user.opted_for_manual_counsellor && user.assigned_counsellor_id) {
    // Already opted in with a counsellor - urgent ping to THAT counsellor,
    // not a re-route to the whole jurisdiction.
    recipients.push({ alert_id: alert.alert_id, official_id: user.assigned_counsellor_id, source: 'distress_score', priority: 'urgent', auto_assigned: false });
  } else {
    const chosenCounsellorId = await selectLeastLoadedCounsellor(user.jurisdiction_id);
    if (chosenCounsellorId) {
      // userId is always the anchor (see auth.user.routes.js's login) -
      // propagates to every other case this person has, not just this one.
      await propagateCounsellorAssignment(userId, { counsellorId: chosenCounsellorId });
      recipients.push({ alert_id: alert.alert_id, official_id: chosenCounsellorId, source: 'distress_score', priority: 'urgent', auto_assigned: true });
    }
  }

  // District Administration still gets visibility into a Critical case
  // regardless of the counsellor-routing branch above - same reasoning as
  // the pre-existing routing every High/Critical alert already had. Fanned
  // out across every jurisdiction the person has a case in (per the Decisions
  // section of the multi-case plan: a crisis is relevant everywhere they have
  // an open case, not just the case that happened to trigger it).
  const jurisdictionIds = await getJurisdictionIdsForCaseFamily(userId);
  const { data: allRoles } = await supabase
    .from('official_roles')
    .select('official_id, roles(role_name)')
    .in('jurisdiction_id', jurisdictionIds)
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
      await enqueueAlertDispatch(alert.alert_id, userId, recipients.map((r) => r.official_id));
    }
  } else {
    console.error('applyStressResponse: Critical alert created with zero notification recipients', { alertId: alert.alert_id, userId });
  }

  return { alertId: alert.alert_id };
}

// Fires alongside applyStressResponse (not instead of it) whenever a weekly
// (105-question) aggregate score is recorded - applyStressResponse's
// response is purely risk-level-driven (a no-op for Low, a queued dispatch
// for Moderate/High, an alert only for Critical), so a Moderate weekly
// review would otherwise leave no distinct trace anywhere a counsellor or
// admin could see it. This is unconditional (any risk level) and tagged
// with its own source ('weekly_review') precisely so it reads as "this user
// just completed their periodic review," not routine per-check-in noise.
async function notifyWeeklyReview(userId) {
  const { data: user, error: userError } = await supabase
    .from('users')
    .select('jurisdiction_id, assigned_counsellor_id')
    .eq('user_id', userId)
    .single();
  if (userError || !user) {
    console.error('notifyWeeklyReview: could not load user', userError?.message);
    return;
  }

  const recipientIds = new Set();
  if (user.assigned_counsellor_id) recipientIds.add(user.assigned_counsellor_id);

  const { data: allRoles } = await supabase
    .from('official_roles')
    .select('official_id, roles(role_name)')
    .eq('jurisdiction_id', user.jurisdiction_id)
    .is('revoked_at', null);
  for (const r of allRoles || []) {
    if (r.roles?.role_name === 'Administration') recipientIds.add(r.official_id);
  }

  // Not an error condition on its own (a user with no assigned counsellor
  // and no Administration officials in their jurisdiction legitimately has
  // no one to notify) - logged anyway, at info/warn rather than error like
  // applyStressResponse's zero-recipient case above, purely so a "why didn't
  // this weekly review notification show up anywhere" question is
  // diagnosable instead of silent.
  if (recipientIds.size === 0) {
    console.warn('notifyWeeklyReview: no recipients found (no assigned counsellor or Administration officials)', { userId });
    return;
  }

  const rows = [...recipientIds].map((officialId) => ({
    user_id: userId,
    official_id: officialId,
    source: 'weekly_review',
    priority: 'normal',
    auto_assigned: false,
  }));
  const { error } = await supabase.from('alert_notifications').insert(rows);
  if (error) console.error('notifyWeeklyReview: could not write alert_notifications', error.message);
}

module.exports = { applyStressResponse, selectLeastLoadedCounsellor, notifyWeeklyReview, getJurisdictionIdsForCaseFamily };
