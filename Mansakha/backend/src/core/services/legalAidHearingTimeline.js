const { pool } = require('../db/pgPool');
const { ensureCourtCaseDetails } = require('./courtCaseSync');

// Shared by DLSA, the Public Prosecutor, and the victim's own three "hearing
// timeline" views (migration_044, requirement 8) - past hearings are
// EXCLUSIVELY eCourt-reported (court_case_details.hearing_history, the same
// simulated feed the victim's own Case Details screen and the Public
// Prosecutor's own Upcoming Hearings page already read), never PP-entered.
// legal_aid_hearing_notes carries only the Public Prosecutor's own notes
// against one of those dates - never a hearing record of its own - so a
// query here always merges the two rather than reading either alone.
//
// hearing_history has no stable id (it's a plain jsonb array), so a note
// attaches to a hearing by DATE - safe here because
// courtCaseSimulation.js's own generator spaces hearings at least 30 days
// apart, so two hearings never land on the same date for one case.
async function loadHearingTimeline(request, { includeUpcoming = false } = {}) {
  let courtCase;
  try {
    courtCase = await ensureCourtCaseDetails({
      userId: request.userId,
      caseStage: request.caseStage,
      docketNumber: request.docketNumber,
      cnrNumber: request.cnrNumber,
      caseTypeName: request.caseTypeName,
      jurisdictionName: request.jurisdictionName,
      enrolledAt: request.enrolledAt,
      victimFullName: request.victimFullName,
    });
  } catch (err) {
    console.error('loadHearingTimeline: could not load court case details', err.message, { requestId: request.requestId });
    return { available: false, reason: 'Court case details are temporarily unavailable.', pastHearings: [], nextHearing: null };
  }

  if (!courtCase.available) {
    return { available: false, reason: courtCase.reason, pastHearings: [], nextHearing: null };
  }

  const { rows: noteRows } = await pool.query(
    `select note_id, hearing_date, note_text, recorded_by_official_id, created_at
     from legal_aid_hearing_notes
     where request_id = $1
     order by hearing_date desc, created_at asc`,
    [request.requestId]
  );
  const notesByDate = new Map();
  for (const n of noteRows) {
    const key = new Date(n.hearing_date).toISOString().slice(0, 10);
    if (!notesByDate.has(key)) notesByDate.set(key, []);
    notesByDate.get(key).push({
      noteId: n.note_id,
      noteText: n.note_text,
      createdAt: n.created_at,
    });
  }

  const history = Array.isArray(courtCase.row.hearing_history) ? courtCase.row.hearing_history : [];
  const pastHearings = [...history]
    .sort((a, b) => (a.date < b.date ? 1 : -1)) // most recent first
    .map((h) => ({
      hearingDate: h.date,
      business: h.business,
      notes: notesByDate.get(h.date) || [],
    }));

  const result = { available: true, pastHearings };
  if (includeUpcoming) {
    result.nextHearing = courtCase.row.next_hearing_date
      ? {
          nextHearingDate: courtCase.row.next_hearing_date,
          nextHearingPurpose: courtCase.row.next_hearing_purpose,
          court: courtCase.row.court_complex || courtCase.row.court_establishment || null,
          courtNumber: courtCase.row.court_number,
          hearingMode: courtCase.row.hearing_mode,
        }
      : null;
  }
  return result;
}

module.exports = { loadHearingTimeline };
