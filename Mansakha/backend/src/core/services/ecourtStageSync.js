const { pool } = require('../db/pgPool');
const { supabase } = require('../db/supabaseClient');
const { writeAuditLog } = require('./auditLog');

// Makes case_stage EXCLUSIVELY eCourt-authoritative, per explicit request:
// no staff role (Data Operator, Administration, Investigating Officer) may
// create, modify, advance, downgrade, or otherwise set it after case
// creation - this module is the ONLY code path in the entire backend that
// writes users.case_stage (besides createUser's own initial 'Investigation'
// insert). Every previous case_stage write site (Data Operator's case-stage
// dropdown, District/State/National Admin's own edit, IO's chargesheet
// auto-advance) has been removed - see each of those files' own comments
// on this change.
//
// There is no free/official eCourts push API to plug into (confirmed
// earlier this session, same reasoning as courtCaseSimulation.js's own
// header) - so "eCourt" here is a deterministic, TIME-BASED simulation: a
// background worker (same startXWorker/setInterval pattern as
// dispatchWorker.js and agencyEscalationChecker.js) that advances each case
// exactly one stage at a time once its own scheduled next_ecourt_stage_at
// arrives, never skipping a stage and never moving backward. This is a
// genuinely new kind of mechanic in this codebase (nothing else auto-
// advances case state over time - the escalation checker only reacts to
// elapsed time to raise a task, it never changes case data itself), so it
// gets its own dedicated module rather than folding into either existing
// worker.
const STAGE_SEQUENCE = ['Investigation', 'Trial', 'Rehabilitation', 'Compensation', 'Case Closed'];

// How long a case sits at each stage before eCourt (simulated) advances it
// to the next one. Deliberately short by default so the transition is
// actually observable/demoable and testable within a normal session,
// configurable via env var for a deployment that wants a realistic
// real-world cadence (weeks/months) instead.
const STAGE_INTERVAL_MS = Number(process.env.ECOURT_STAGE_INTERVAL_MS) || 3 * 60 * 1000; // 3 minutes

function getNextStage(currentStage) {
  const idx = STAGE_SEQUENCE.indexOf(currentStage);
  if (idx === -1 || idx === STAGE_SEQUENCE.length - 1) return null; // unknown or already terminal
  return STAGE_SEQUENCE[idx + 1];
}

// The sole writer of users.case_stage. Handles the one cross-cutting side
// effect the case-lifecycle spec requires: a case the victim ever opted
// into Rehabilitation for, closed by this transition, must trigger the
// special "your case has been closed - continue Rehabilitation anyway?"
// popup instead of just silently closing like any other case.
//
// Gated on rehabilitation_opted_in_at (a fact about the VICTIM's decision,
// set once and never cleared), not on fromStage === 'Rehabilitation'
// literally - under STAGE_SEQUENCE's strict linear order, the stage
// immediately before Case Closed is always Compensation, never
// Rehabilitation itself, so a fromStage-based check could never actually
// fire. Checking the opt-in fact instead means the popup correctly appears
// on the real Compensation -> Case Closed transition for any case the
// victim opted into Rehabilitation for earlier in its lifecycle, which is
// what "a case that was in Rehabilitation" means in practice here.
async function applyECourtStageTransition(userId) {
  const { rows } = await pool.query(
    `select case_stage, rehabilitation_opted_in_at from users where user_id = $1`,
    [userId]
  );
  const user = rows[0];
  if (!user) return null;

  const fromStage = user.case_stage;
  const toStage = getNextStage(fromStage);
  if (!toStage) return null; // already terminal, nothing to do

  const closingAfterRehabilitationOptIn = toStage === 'Case Closed' && !!user.rehabilitation_opted_in_at;
  const nextStageAt = toStage === 'Case Closed' ? null : new Date(Date.now() + STAGE_INTERVAL_MS).toISOString();

  const patch = { case_stage: toStage, next_ecourt_stage_at: nextStageAt };
  if (closingAfterRehabilitationOptIn) {
    patch.rehabilitation_closure_pending_ack = true;
  }

  const { error } = await supabase.from('users').update(patch).eq('user_id', userId);
  if (error) {
    console.error('applyECourtStageTransition: could not update case_stage', error.message, { userId, fromStage, toStage });
    return null;
  }

  await writeAuditLog({ userId, action: 'update', entityType: 'ecourt_case_stage', entityId: userId });
  console.log(`eCourt sync: ${userId} advanced ${fromStage} -> ${toStage}${patch.rehabilitation_closure_pending_ack ? ' (rehabilitation-closure popup armed)' : ''}`);

  return { fromStage, toStage };
}

async function runECourtSyncTick() {
  const { rows } = await pool.query(
    `select user_id from users
     where case_stage != 'Case Closed' and next_ecourt_stage_at is not null and next_ecourt_stage_at <= now()`
  );

  let advancedCount = 0;
  for (const row of rows) {
    const result = await applyECourtStageTransition(row.user_id);
    if (result) advancedCount += 1;
  }
  return advancedCount;
}

function startECourtSyncWorker(intervalMs = 30 * 1000) {
  const tick = async () => {
    try {
      const count = await runECourtSyncTick();
      if (count) console.log(`eCourt sync: ${count} case(s) advanced this tick.`);
    } catch (err) {
      console.error('eCourt sync tick failed:', err.message);
    }
  };
  tick();
  return setInterval(tick, intervalMs);
}

module.exports = { STAGE_SEQUENCE, STAGE_INTERVAL_MS, getNextStage, applyECourtStageTransition, runECourtSyncTick, startECourtSyncWorker };
