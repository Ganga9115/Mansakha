const { pool } = require('../db/pgPool');
const { supabase } = require('../db/supabaseClient');

// Automatic escalation to District Collector - genuinely new, separate from
// dispatchWorker.js's existing check-in/disengagement pipeline (which stays
// completely untouched). Two triggers, both create a real agency_tasks row
// (migration_030) targeting 'District Collector', auto_generated = true, so
// a committee review has real substance to act on instead of requiring a
// District Admin to notice and manually escalate every time.
//
// Deliberately does NOT touch agency_referrals.status or resolve anything
// itself - it only ever adds a District Collector task. The referral it
// escalated stays exactly as it is; a human still decides what to do next.

const STALE_REFERRAL_DAYS = 7; // Open referral, no resolution, this long -> escalate
const ESCALATION_TASK_DUE_DAYS = 2; // DC gets this long to review

async function escalateStaleReferrals() {
  // Referrals Open longer than the threshold, with no existing
  // auto-generated escalation task yet for that same referral (the partial
  // unique index on agency_tasks makes "does one already exist" a plain
  // existence check, not a race-prone read-then-write).
  const { rows: stale } = await pool.query(
    `select ar.referral_id, ar.user_id, ar.referred_to_role, ar.created_at
     from agency_referrals ar
     where ar.status = 'Open'
       and ar.created_at < now() - ($1 || ' days')::interval
       and not exists (
         select 1 from agency_tasks t where t.source_referral_id = ar.referral_id and t.auto_generated = true
       )`,
    [STALE_REFERRAL_DAYS]
  );

  for (const referral of stale) {
    const daysOpen = Math.floor((Date.now() - new Date(referral.created_at).getTime()) / 86400000);
    const { error } = await supabase.from('agency_tasks').insert({
      user_id: referral.user_id,
      source_referral_id: referral.referral_id,
      assigned_to_role: 'District Collector',
      created_by_official_id: null,
      action: `Referral to ${referral.referred_to_role} has been Open for ${daysOpen} days with no resolution - review and issue a directive if needed.`,
      due_at: new Date(Date.now() + ESCALATION_TASK_DUE_DAYS * 86400000).toISOString(),
      auto_generated: true,
    });
    if (error) console.error('escalateStaleReferrals: could not create task', error.message, { referralId: referral.referral_id });
  }

  return stale.length;
}

async function escalateMissedSlas() {
  // DLSA's 48h lawyer-assignment SLA (dlsa.routes.js's assign-lawyer route)
  // is the one metadata-based SLA in the system today - metadata.slaDeadline
  // is only ever set once a referral reaches DLSA, so this check is scoped
  // to that role rather than being a generic "any metadata.slaDeadline"
  // scan that would need a schema-wide convention that doesn't exist yet.
  const { rows: missed } = await pool.query(
    `select ar.referral_id, ar.user_id
     from agency_referrals ar
     where ar.status = 'Open'
       and ar.referred_to_role = 'DLSA Coordinator'
       and ar.metadata ? 'slaDeadline'
       and (ar.metadata->>'assignedLawyer') is null
       and (ar.metadata->>'slaDeadline')::timestamptz < now()
       and not exists (
         select 1 from agency_tasks t where t.source_referral_id = ar.referral_id and t.auto_generated = true
       )`
  );

  for (const referral of missed) {
    const { error } = await supabase.from('agency_tasks').insert({
      user_id: referral.user_id,
      source_referral_id: referral.referral_id,
      assigned_to_role: 'District Collector',
      created_by_official_id: null,
      action: 'DLSA missed its 48-hour panel-lawyer assignment SLA on this case - review and issue a directive if needed.',
      due_at: new Date(Date.now() + ESCALATION_TASK_DUE_DAYS * 86400000).toISOString(),
      auto_generated: true,
    });
    if (error) console.error('escalateMissedSlas: could not create task', error.message, { referralId: referral.referral_id });
  }

  return missed.length;
}

// Same setInterval-based pattern as dispatchWorker.js's startDispatchWorker -
// a separate, independently-started worker, not a change to that one.
function startAgencyEscalationChecker(intervalMs = 60 * 60 * 1000) {
  const tick = async () => {
    try {
      const staleCount = await escalateStaleReferrals();
      const slaCount = await escalateMissedSlas();
      if (staleCount || slaCount) {
        console.log(`Agency escalation checker: ${staleCount} stale referral(s), ${slaCount} missed-SLA case(s) escalated to District Collector.`);
      }
    } catch (err) {
      console.error('Agency escalation checker tick failed:', err.message);
    }
  };
  tick();
  return setInterval(tick, intervalMs);
}

module.exports = { escalateStaleReferrals, escalateMissedSlas, startAgencyEscalationChecker };
