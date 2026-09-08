// Shared, pure-function compensation schedule - used by DWO's own routes
// (to verify/adjust and track payment) AND the victim's own read-only
// status view (to auto-identify the applicable category the moment a case
// is registered, per the "Case Registered -> Compensation Module" flow,
// before any DWO action has happened at all). Same discipline as
// threatAssessment.js's computeThreatTier - a pure function, computed
// fresh on every read, never trusted as a stored, possibly-stale label.

// Real PoA Act statutory relief tiers (Dr. Ambedkar National Relief to
// SC/ST Victims of Atrocities Scheme, and the Act's own Annexure schedule)
// range roughly Rs 85,000 to Rs 8,25,000 depending on offence severity,
// with further additional relief for the most heinous offences. Exact
// figures vary by state notification and case specifics - this is a
// starting SUGGESTED amount DWO verifies/adjusts, not a binding
// calculation, and is disclosed to the victim as a suggestion, not a
// guarantee.
const COMPENSATION_SCHEDULE = {
  'Rape/Gang Rape': { statutoryCategory: 'Rape/Gang Rape - Annexure Category I', suggestedAmount: 500000 },
  'Murder/Grievous Hurt/Arson': { statutoryCategory: 'Murder/Grievous Hurt/Arson - Annexure Category I', suggestedAmount: 500000 },
  'Family Affected by Caste-Based Violence': { statutoryCategory: 'Caste-Based Atrocity - Annexure Category II', suggestedAmount: 200000 },
  'Witness Facing Intimidation or Threats': { statutoryCategory: 'Intimidation/Threat - Annexure Category III', suggestedAmount: 85000 },
};
const DEFAULT_COMPENSATION_SCHEDULE = { statutoryCategory: 'General SC/ST (PoA) Act Atrocity', suggestedAmount: 85000 };

function getCompensationSchedule(caseTypeName) {
  return COMPENSATION_SCHEDULE[caseTypeName] || DEFAULT_COMPENSATION_SCHEDULE;
}

// This app's own disbursement split across the case's 3 real milestones -
// a portion on FIR/registration, the balance tied to chargesheet and the
// eventual court outcome. Mirrors how PoA Act relief is commonly staggered
// in practice, not a verbatim quotation of one specific state's rule.
// unlocksAtCaseStage reuses the EXISTING users.case_stage progression
// directly - no new tracking needed for "has the chargesheet been filed
// yet", since case_stage moving to 'Trial' already means exactly that.
const COMPENSATION_STAGES = [
  { stage: 'FIR / Initial Stage', percentage: 50, unlocksAtCaseStage: 'Investigation' },
  { stage: 'Chargesheet Filed', percentage: 25, unlocksAtCaseStage: 'Trial' },
  { stage: 'Final Stage (Court Outcome)', percentage: 25, unlocksAtCaseStage: 'Compensation' },
];
const CASE_STAGE_ORDER = ['Investigation', 'Trial', 'Compensation', 'Case Closed'];
const COMPENSATION_ESCALATION_DAYS = 14; // "still unresolved" -> DC escalation threshold

// 'Rehabilitation' is a distinct post-closure stage (migration_029) that
// sits outside this list entirely - by the time a case reaches it every
// compensation stage is necessarily unlocked, so it is treated as "beyond
// the final stage" rather than added to CASE_STAGE_ORDER itself.
function isCompensationStageUnlocked(unlocksAtCaseStage, currentCaseStage) {
  if (currentCaseStage === 'Rehabilitation') return true;
  const currentIdx = CASE_STAGE_ORDER.indexOf(currentCaseStage);
  const unlockIdx = CASE_STAGE_ORDER.indexOf(unlocksAtCaseStage);
  if (currentIdx === -1 || unlockIdx === -1) return false;
  return currentIdx >= unlockIdx;
}

function buildCompensationStages(verifiedAmount) {
  return COMPENSATION_STAGES.map((s) => ({
    stage: s.stage,
    percentage: s.percentage,
    unlocksAtCaseStage: s.unlocksAtCaseStage,
    amount: Math.round((verifiedAmount * s.percentage) / 100),
    status: 'Pending',
    paidAt: null,
  }));
}

// Computes the live view of compensation.stages (unlocked flag recomputed
// fresh from the case's current stage every time - never trusted from
// whatever was true when a stage object was first written).
function withLiveCompensationView(compensation, currentCaseStage) {
  if (!compensation) return null;
  return {
    ...compensation,
    stages: compensation.stages.map((s) => ({ ...s, unlocked: isCompensationStageUnlocked(s.unlocksAtCaseStage, currentCaseStage) })),
  };
}

module.exports = {
  COMPENSATION_STAGES,
  CASE_STAGE_ORDER,
  COMPENSATION_ESCALATION_DAYS,
  getCompensationSchedule,
  buildCompensationStages,
  isCompensationStageUnlocked,
  withLiveCompensationView,
};
