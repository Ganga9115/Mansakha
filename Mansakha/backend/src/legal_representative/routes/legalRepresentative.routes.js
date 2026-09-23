const express = require('express');
const { pool, withTransaction } = require('../../core/db/pgPool');
const { supabase } = require('../../core/db/supabaseClient');
const { writeAuditLog } = require('../../core/services/auditLog');
const { verifyToken } = require('../../core/middleware/verifyToken');
const { requireRole } = require('../../core/middleware/requireRole');
const { generalApiLimiter } = require('../../core/middleware/rateLimiter');
const { ok, fail } = require('../../core/services/responseEnvelope');
const { loadRequestDocuments } = require('../../core/services/legalAidDocuments');
const { ensureCourtCaseDetails } = require('../../core/services/courtCaseSync');
const { loadHearingTimeline } = require('../../core/services/legalAidHearingTimeline');

// Public Prosecutor (migration_040) - the real DLSA-assigned advocate
// role for the dedicated Legal Aid pipeline. Every route here filters by
// DIRECT ASSIGNMENT (legal_aid_assignments.representative_official_id = the
// caller's own id), not by jurisdiction - jurisdictionId only matters at
// DLSA's own assignment-time (dlsa.routes.js's eligible-representatives
// picker), it plays no part in any query this role runs on its own cases.
//
// migration_044: an assignment is no longer instantly binding - DLSA's own
// assign action creates it as 'Pending Acceptance', and only this role's own
// Accept/Reject decision (below) resolves it to 'Active' or 'Rejected'. A
// case is genuinely this Public Prosecutor's own responsibility only once
// they've accepted it.
const ROLE_NAME = 'Public Prosecutor';

const router = express.Router();

router.use(verifyToken, requireRole([ROLE_NAME]), generalApiLimiter);

// 404 (never a bare 403) unless this official has/had an assignment on the
// request - matches this app's existing convention of not distinguishing
// "doesn't exist" from "not yours" to another role's queue.
async function loadOwnCaseRequest(req, res) {
  const { rows } = await pool.query(
    `select lar.request_id, lar.user_id, lar.reason, lar.description, lar.status, lar.created_at, lar.updated_at,
            u.docket_number, u.case_stage, u.cnr_number, u.enrolled_at, u.jurisdiction_id,
            ct.name as case_type_name, j.name as jurisdiction_name, ui.full_name as victim_full_name,
            laa.assignment_id, laa.status as assignment_status, laa.assigned_by_official_id
     from legal_aid_requests lar
     join users u on u.user_id = lar.user_id
     join case_types ct on ct.case_type_id = u.case_type_id
     left join jurisdictions j on j.jurisdiction_id = u.jurisdiction_id
     left join user_identity ui on ui.user_id = coalesce(u.linked_to_user_id, u.user_id)
     join legal_aid_assignments laa on laa.request_id = lar.request_id and laa.representative_official_id = $2
     where lar.request_id = $1
     order by laa.assigned_at desc
     limit 1`,
    [req.params.requestId, req.auth.officialId]
  );
  const r = rows[0];
  if (!r) {
    fail(res, 'Case not found', 404);
    return null;
  }
  return r;
}

router.get('/my-cases', async (req, res) => {
  const { status } = req.query;
  const statuses = status === 'history' ? ['Reassigned', 'Rejected', 'Completed']
    : status === 'pending' ? ['Pending Acceptance']
    : ['Active'];

  const { rows } = await pool.query(
    `select lar.request_id, lar.reason, lar.status as request_status, lar.created_at,
            u.user_id, u.docket_number, u.case_stage, u.cnr_number, u.enrolled_at,
            ct.name as case_type_name, j.name as jurisdiction_name, ui.full_name as victim_full_name,
            laa.assignment_id, laa.status as assignment_status, laa.assigned_at
     from legal_aid_assignments laa
     join legal_aid_requests lar on lar.request_id = laa.request_id
     join users u on u.user_id = lar.user_id
     join case_types ct on ct.case_type_id = u.case_type_id
     left join jurisdictions j on j.jurisdiction_id = u.jurisdiction_id
     left join user_identity ui on ui.user_id = coalesce(u.linked_to_user_id, u.user_id)
     where laa.representative_official_id = $1 and laa.status = any($2::text[])
     order by laa.assigned_at desc`,
    [req.auth.officialId, statuses]
  );

  // Next hearing date per case, same eCourt source as /hearings-upcoming -
  // pending cases skip this (nothing to prepare for until accepted).
  const withNextHearing = await Promise.all(rows.map(async (r) => {
    if (r.assignment_status !== 'Active') return { ...r, next_hearing_date: null };
    const timeline = await loadHearingTimeline({
      requestId: r.request_id, userId: r.user_id, caseStage: r.case_stage, docketNumber: r.docket_number,
      cnrNumber: r.cnr_number, caseTypeName: r.case_type_name, jurisdictionName: r.jurisdiction_name,
      enrolledAt: r.enrolled_at, victimFullName: r.victim_full_name,
    }, { includeUpcoming: true });
    return { ...r, next_hearing_date: timeline.nextHearing?.nextHearingDate || null };
  }));

  return ok(res, {
    cases: withNextHearing.map((r) => ({
      requestId: r.request_id,
      assignmentId: r.assignment_id,
      docketNumber: r.docket_number,
      caseTypeName: r.case_type_name,
      caseStage: r.case_stage,
      requestStatus: r.request_status,
      assignmentStatus: r.assignment_status,
      assignedAt: r.assigned_at,
      nextHearingDate: r.next_hearing_date,
    })),
  });
});

router.get('/my-cases/:requestId', async (req, res) => {
  const request = await loadOwnCaseRequest(req, res);
  if (!request) return;

  const documents = await loadRequestDocuments(request.request_id);

  const { rows: assignments } = await pool.query(
    `select laa.assignment_id, laa.status, laa.assigned_at, laa.ended_at, laa.ended_reason, o.full_name as representative_name
     from legal_aid_assignments laa
     join officials o on o.official_id = laa.representative_official_id
     where laa.request_id = $1
     order by laa.assigned_at asc`,
    [request.request_id]
  );

  // migration_044: past hearings are eCourt-only (requirement 8) - never a
  // Public-Prosecutor-authored record.
  const hearingTimeline = await loadHearingTimeline({
    requestId: request.request_id, userId: request.user_id, caseStage: request.case_stage,
    docketNumber: request.docket_number, cnrNumber: request.cnr_number, caseTypeName: request.case_type_name,
    jurisdictionName: request.jurisdiction_name, enrolledAt: request.enrolled_at, victimFullName: request.victim_full_name,
  }, { includeUpcoming: true });

  await writeAuditLog({ officialId: req.auth.officialId, action: 'read', entityType: 'legal_aid_request', entityId: request.request_id });

  return ok(res, {
    requestId: request.request_id,
    docketNumber: request.docket_number,
    caseTypeName: request.case_type_name,
    caseStage: request.case_stage,
    reason: request.reason,
    description: request.description,
    requestStatus: request.status,
    myAssignmentStatus: request.assignment_status,
    documents,
    assignments: assignments.map((a) => ({
      assignmentId: a.assignment_id,
      status: a.status,
      representativeName: a.representative_name,
      assignedAt: a.assigned_at,
      endedAt: a.ended_at,
      endedReason: a.ended_reason,
    })),
    hearingTimeline,
  });
});

// Requirement 6 - a Public Prosecutor is not bound to a case DLSA assigns
// them until they explicitly say so. Accept is the only route that ever
// moves a request itself to 'Active' (see dlsa.routes.js's own assign-
// representative comment on why it no longer does this directly).
router.post('/my-cases/:requestId/accept', async (req, res) => {
  const request = await loadOwnCaseRequest(req, res);
  if (!request) return;
  if (request.assignment_status !== 'Pending Acceptance') {
    return fail(res, `This assignment is '${request.assignment_status}', not awaiting your acceptance`, 400);
  }

  await withTransaction(async (client) => {
    await client.query(`update legal_aid_assignments set status = 'Active' where assignment_id = $1`, [request.assignment_id]);
    await client.query(
      `update legal_aid_requests set status = 'Active', reviewed_by_official_id = $1, reviewed_at = now(), updated_at = now() where request_id = $2`,
      [req.auth.officialId, request.request_id]
    );
  });

  await writeAuditLog({
    officialId: req.auth.officialId, userId: request.user_id, action: 'update', entityType: 'legal_aid_assignment', entityId: request.assignment_id,
    details: { note: 'Public Prosecutor accepted the case' },
  });

  return ok(res, { requestId: request.request_id, status: 'Active' }, 'Case accepted');
});

// Requirement 6 - the decline path. Does not touch legal_aid_requests.status
// (it was never changed at assign-time, so it's already sitting at whatever
// it was before - 'Under Review' for a first assignment, 'Active' for a
// reassignment where some other assignment is still the case's real one).
// DLSA needs to know to act again - dlsa.routes.js's own GET
// /legal-aid-requests computes this live off the latest assignment's status
// rather than this route storing a separate flag, so it can never drift.
router.post('/my-cases/:requestId/reject', async (req, res) => {
  const request = await loadOwnCaseRequest(req, res);
  if (!request) return;
  if (request.assignment_status !== 'Pending Acceptance') {
    return fail(res, `This assignment is '${request.assignment_status}', not awaiting your acceptance`, 400);
  }

  const { reason } = req.body;

  await pool.query(
    `update legal_aid_assignments set status = 'Rejected', ended_at = now(), ended_reason = $1 where assignment_id = $2`,
    [reason && String(reason).trim() ? String(reason).trim() : 'Rejected by Public Prosecutor', request.assignment_id]
  );

  await writeAuditLog({
    officialId: req.auth.officialId, userId: request.user_id, action: 'update', entityType: 'legal_aid_assignment', entityId: request.assignment_id,
    details: { note: 'Public Prosecutor rejected the case', reason: reason || null },
  });

  // Best-effort - surfaced to DLSA as the needsReassignment flag on their own
  // queue regardless of whether this insert succeeds (see that route's own
  // comment); this is a secondary signal, not the source of truth.
  if (request.assigned_by_official_id) {
    const { error: notifyError } = await supabase.from('alert_notifications').insert({
      user_id: request.user_id, official_id: request.assigned_by_official_id, source: 'legal_aid', priority: 'urgent',
    });
    if (notifyError) console.error('reject: could not notify DLSA', notifyError.message, { requestId: request.request_id });
  }

  return ok(res, { requestId: request.request_id }, 'Case rejected - DLSA has been notified to assign another Public Prosecutor');
});

// Requirement 8 - past hearings come exclusively from the eCourt-simulated
// feed now (loadHearingTimeline, above); this only ever adds this Public
// Prosecutor's own note against one of those already-reported dates, never
// a hearing record of their own making.
router.post('/my-cases/:requestId/hearing-notes', async (req, res) => {
  const request = await loadOwnCaseRequest(req, res);
  if (!request) return;
  if (request.assignment_status !== 'Active') return fail(res, 'You are not the currently active Public Prosecutor on this case', 403);

  const { hearingDate, noteText } = req.body;
  if (!hearingDate) return fail(res, 'hearingDate is required', 400);
  if (!noteText || !String(noteText).trim()) return fail(res, 'noteText is required', 400);

  const { rows } = await pool.query(
    `insert into legal_aid_hearing_notes (request_id, assignment_id, recorded_by_official_id, hearing_date, note_text)
     values ($1, $2, $3, $4, $5) returning note_id, created_at`,
    [request.request_id, request.assignment_id, req.auth.officialId, hearingDate, String(noteText).trim()]
  );

  await writeAuditLog({ officialId: req.auth.officialId, userId: request.user_id, action: 'create', entityType: 'legal_aid_hearing_note', entityId: rows[0].note_id });

  return ok(res, { noteId: rows[0].note_id, createdAt: rows[0].created_at }, 'Note added', 201);
});

// This representative's own upcoming hearings across every Active case -
// backs the "Hearings" nav page. Sourced from each case's own eCourt data
// (court_case_details.next_hearing_date, the same simulated-eCourt-sync feed
// the victim's own Case Details screen already shows - see
// courtCaseSync.js's own comment on why this reuses that exact logic).
router.get('/hearings-upcoming', async (req, res) => {
  const { rows: cases } = await pool.query(
    `select lar.request_id, u.user_id, u.docket_number, u.case_stage, u.cnr_number, u.enrolled_at,
            ct.name as case_type_name, j.name as jurisdiction_name, ui.full_name as victim_full_name
     from legal_aid_assignments laa
     join legal_aid_requests lar on lar.request_id = laa.request_id
     join users u on u.user_id = lar.user_id
     left join case_types ct on ct.case_type_id = u.case_type_id
     left join jurisdictions j on j.jurisdiction_id = u.jurisdiction_id
     left join user_identity ui on ui.user_id = coalesce(u.linked_to_user_id, u.user_id)
     where laa.representative_official_id = $1 and laa.status = 'Active'`,
    [req.auth.officialId]
  );

  const withCourtData = await Promise.all(cases.map(async (c) => {
    let courtCase;
    try {
      courtCase = await ensureCourtCaseDetails({
        userId: c.user_id,
        caseStage: c.case_stage,
        docketNumber: c.docket_number,
        cnrNumber: c.cnr_number,
        caseTypeName: c.case_type_name,
        jurisdictionName: c.jurisdiction_name,
        enrolledAt: c.enrolled_at,
        victimFullName: c.victim_full_name,
      });
    } catch (err) {
      console.error('hearings-upcoming: could not load court case details', err.message, { requestId: c.request_id });
      return null;
    }
    if (!courtCase.available || !courtCase.row.next_hearing_date) return null;
    return {
      requestId: c.request_id,
      docketNumber: c.docket_number,
      // Case details alongside the hearing itself - so this list stands on
      // its own for hearing prep without a click-through to My Cases first.
      caseTypeName: c.case_type_name,
      // The eCourt's own stage (e.g. "Awaiting First Hearing"), not NHAA's
      // internal case_stage (Investigation/Trial/Compensation) - the two
      // track different things and can legitimately diverge (a case can be
      // past Compensation administratively while the court proceeding
      // itself is still ongoing), so showing NHAA's stage next to a court
      // hearing's own purpose/date read as contradictory (e.g. "Compensation"
      // stage next to a hearing "For framing of charges"). This is a
      // hearings list sourced entirely from eCourt data, so the eCourt's
      // own stage is what belongs here.
      caseStage: courtCase.row.case_stage_label,
      victimName: c.victim_full_name || null,
      nextHearingDate: courtCase.row.next_hearing_date,
      nextHearingPurpose: courtCase.row.next_hearing_purpose,
      court: courtCase.row.court_complex || courtCase.row.court_establishment || null,
      courtNumber: courtCase.row.court_number,
      hearingMode: courtCase.row.hearing_mode,
    };
  }));

  const upcomingHearings = withCourtData
    .filter((h) => h && h.nextHearingDate >= new Date().toISOString().slice(0, 10))
    .sort((a, b) => a.nextHearingDate.localeCompare(b.nextHearingDate));

  return ok(res, { upcomingHearings });
});

module.exports = router;
