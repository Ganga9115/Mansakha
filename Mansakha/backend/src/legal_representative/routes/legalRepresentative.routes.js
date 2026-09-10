const express = require('express');
const { pool, withTransaction } = require('../../core/db/pgPool');
const { writeAuditLog } = require('../../core/services/auditLog');
const { verifyToken } = require('../../core/middleware/verifyToken');
const { requireRole } = require('../../core/middleware/requireRole');
const { generalApiLimiter } = require('../../core/middleware/rateLimiter');
const { ok, fail } = require('../../core/services/responseEnvelope');
const { loadRequestDocuments } = require('../../core/services/legalAidDocuments');

// Public Prosecutor (migration_040) - the real DLSA-assigned advocate
// role for the dedicated Legal Aid pipeline. Every route here filters by
// DIRECT ASSIGNMENT (legal_aid_assignments.representative_official_id = the
// caller's own id), not by jurisdiction - jurisdictionId only matters at
// DLSA's own assignment-time (dlsa.routes.js's eligible-representatives
// picker), it plays no part in any query this role runs on its own cases.
const ROLE_NAME = 'Public Prosecutor';

const router = express.Router();

router.use(verifyToken, requireRole([ROLE_NAME]), generalApiLimiter);

// 404 (never a bare 403) unless this official has/had an assignment on the
// request - matches this app's existing convention of not distinguishing
// "doesn't exist" from "not yours" to another role's queue.
async function loadOwnCaseRequest(req, res) {
  const { rows } = await pool.query(
    `select lar.request_id, lar.user_id, lar.reason, lar.description, lar.status, lar.created_at, lar.updated_at,
            u.docket_number, u.case_stage, ct.name as case_type_name,
            laa.assignment_id, laa.status as assignment_status
     from legal_aid_requests lar
     join users u on u.user_id = lar.user_id
     join case_types ct on ct.case_type_id = u.case_type_id
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
  const statuses = status === 'history' ? ['Reassigned', 'Completed'] : ['Active'];

  const { rows } = await pool.query(
    `select lar.request_id, lar.reason, lar.status as request_status, lar.created_at,
            u.docket_number, u.case_stage, ct.name as case_type_name,
            laa.assignment_id, laa.status as assignment_status, laa.assigned_at,
            (select h.next_hearing_date from legal_aid_hearings h where h.request_id = lar.request_id order by h.hearing_date desc limit 1) as next_hearing_date,
            (select h.outcome from legal_aid_hearings h where h.request_id = lar.request_id order by h.hearing_date desc limit 1) as last_hearing_outcome
     from legal_aid_assignments laa
     join legal_aid_requests lar on lar.request_id = laa.request_id
     join users u on u.user_id = lar.user_id
     join case_types ct on ct.case_type_id = u.case_type_id
     where laa.representative_official_id = $1 and laa.status = any($2::text[])
     order by laa.assigned_at desc`,
    [req.auth.officialId, statuses]
  );

  return ok(res, {
    cases: rows.map((r) => ({
      requestId: r.request_id,
      assignmentId: r.assignment_id,
      docketNumber: r.docket_number,
      caseTypeName: r.case_type_name,
      caseStage: r.case_stage,
      requestStatus: r.request_status,
      assignmentStatus: r.assignment_status,
      assignedAt: r.assigned_at,
      nextHearingDate: r.next_hearing_date,
      lastHearingOutcome: r.last_hearing_outcome,
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

  const { rows: hearings } = await pool.query(
    `select hearing_id, hearing_date, court, hearing_type, outcome, next_hearing_date, notes, created_at
     from legal_aid_hearings where request_id = $1 order by hearing_date desc`,
    [request.request_id]
  );

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
    hearings: hearings.map((h) => ({
      hearingId: h.hearing_id,
      hearingDate: h.hearing_date,
      court: h.court,
      hearingType: h.hearing_type,
      outcome: h.outcome,
      nextHearingDate: h.next_hearing_date,
      notes: h.notes,
      createdAt: h.created_at,
    })),
  });
});

// assignment_id is always resolved server-side from the caller's OWN current
// Active assignment on this request - never accepted from the client, which
// would let a representative spoof a hearing onto someone else's assignment_id.
router.post('/my-cases/:requestId/hearings', async (req, res) => {
  const request = await loadOwnCaseRequest(req, res);
  if (!request) return;
  if (request.assignment_status !== 'Active') return fail(res, 'You are not the currently active representative on this case', 403);

  const { hearingDate, court, hearingType, outcome, nextHearingDate, notes } = req.body;
  if (!hearingDate) return fail(res, 'hearingDate is required', 400);
  if (!outcome || !String(outcome).trim()) return fail(res, 'outcome is required', 400);

  const { rows } = await pool.query(
    `insert into legal_aid_hearings (request_id, assignment_id, recorded_by_official_id, hearing_date, court, hearing_type, outcome, next_hearing_date, notes)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning hearing_id`,
    [request.request_id, request.assignment_id, req.auth.officialId, hearingDate, court || null, hearingType || null, String(outcome).trim(), nextHearingDate || null, notes ? String(notes).trim() || null : null]
  );

  await writeAuditLog({ officialId: req.auth.officialId, userId: request.user_id, action: 'create', entityType: 'legal_aid_hearing', entityId: rows[0].hearing_id });

  return ok(res, { hearingId: rows[0].hearing_id }, 'Hearing outcome recorded', 201);
});

// Strictly internal - never part of the official case record, never visible
// to DLSA or the victim (see migration_040's own comment on how this is
// enforced: no route under /api/dlsa/* or /api/user/* ever queries this
// table, and every query here is additionally scoped to the caller's own
// author_official_id). Create + Read only, matching the append-only
// precedent of every other notes table in this codebase (case_notes,
// agency_referral_notes) - neither has an update/delete route anywhere.
router.get('/my-cases/:requestId/private-notes', async (req, res) => {
  const request = await loadOwnCaseRequest(req, res);
  if (!request) return;

  const { rows } = await pool.query(
    `select note_id, note_text, created_at from legal_aid_private_notes
     where request_id = $1 and author_official_id = $2
     order by created_at desc`,
    [request.request_id, req.auth.officialId]
  );

  return ok(res, { notes: rows.map((n) => ({ noteId: n.note_id, noteText: n.note_text, createdAt: n.created_at })) });
});

router.post('/my-cases/:requestId/private-notes', async (req, res) => {
  const request = await loadOwnCaseRequest(req, res);
  if (!request) return;

  const { noteText } = req.body;
  if (!noteText || !String(noteText).trim()) return fail(res, 'noteText is required', 400);

  const { rows } = await pool.query(
    `insert into legal_aid_private_notes (request_id, assignment_id, author_official_id, note_text)
     values ($1, $2, $3, $4) returning note_id, created_at`,
    [request.request_id, request.assignment_id, req.auth.officialId, String(noteText).trim()]
  );

  await writeAuditLog({ officialId: req.auth.officialId, action: 'create', entityType: 'legal_aid_private_note', entityId: rows[0].note_id });

  return ok(res, { noteId: rows[0].note_id, createdAt: rows[0].created_at }, 'Note added', 201);
});

// This representative's own upcoming hearings across every Active case -
// backs the "Hearings" nav page. A hearing row is itself the RECORD of a
// past outcome; "upcoming" here means its own next_hearing_date field,
// looking forward from today.
router.get('/hearings-upcoming', async (req, res) => {
  const { rows } = await pool.query(
    `select h.hearing_id, h.next_hearing_date, h.court, h.hearing_type, u.docket_number, lar.request_id
     from legal_aid_hearings h
     join legal_aid_requests lar on lar.request_id = h.request_id
     join legal_aid_assignments laa on laa.request_id = lar.request_id and laa.representative_official_id = $1 and laa.status = 'Active'
     join users u on u.user_id = lar.user_id
     where h.next_hearing_date is not null and h.next_hearing_date >= current_date
       and h.hearing_id in (
         select h2.hearing_id from legal_aid_hearings h2 where h2.request_id = h.request_id order by h2.hearing_date desc limit 1
       )
     order by h.next_hearing_date asc`,
    [req.auth.officialId]
  );

  return ok(res, {
    upcomingHearings: rows.map((h) => ({
      hearingId: h.hearing_id,
      requestId: h.request_id,
      docketNumber: h.docket_number,
      nextHearingDate: h.next_hearing_date,
      court: h.court,
      hearingType: h.hearing_type,
    })),
  });
});

module.exports = router;
