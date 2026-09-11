// Single source of truth for tunable constants shared between the Legal Aid
// routes files (user.routes.js's victim-facing feedback submission and
// dlsa.routes.js's DLSA-review queue) - kept in one place so the threshold
// can never drift between the two call sites if it's ever re-tuned.

// A victim's per-hearing rating of 1-5. A rating at or below this value is
// "poor" and routes the feedback into DLSA's review queue (continue the
// current representative, or reassign) rather than closing silently - a
// rating above it requires no DLSA action at all.
const POOR_FEEDBACK_RATING_THRESHOLD = 2;

module.exports = { POOR_FEEDBACK_RATING_THRESHOLD };
