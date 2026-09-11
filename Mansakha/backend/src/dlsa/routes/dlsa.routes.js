const express = require('express');
const { supabase } = require('../../core/db/supabaseClient');
const { pool, withTransaction } = require('../../core/db/pgPool');
const { writeAuditLog } = require('../../core/services/auditLog');
const { verifyToken } = require('../../core/middleware/verifyToken');
const { requireRole } = require('../../core/middleware/requireRole');
const { generalApiLimiter } = require('../../core/middleware/rateLimiter');
const { ok, fail } = require('../../core/services/responseEnvelope');
const { mountInterventionReviewRoutes } = require('../../core/services/interventionRequestReview');
const { loadRequestDocuments } = require('../../core/services/legalAidDocuments');
const { loadHearingTimeline } = require('../../core/services/legalAidHearingTimeline');

const router = express.Router();

// DLSA Coordinator - copied from dwo/routes/dwo.routes.js (the template);
// ROLE_NAME differs, and this role additionally gets PATCH .../metadata to
// record an assigned lawyer + a 48h SLA deadline (agency_referrals.metadata
// jsonb - same data-driven pattern as intervention_types.required_documents,
// no schema change needed for these role-specific fields).
const ROLE_NAME = 'DLSA Coordinator';

router.use(verifyToken, requireRole([ROLE_NAME]), generalApiLimiter);

// Legal Aid requests (Request Assistance, proof verified - caste
// certificate, FIR copy, photo ID) are DLSA's own to review, not District
// Admin's - this is exactly DLSA's real statutory function. Not
// jurisdiction-scoped, matching this role's own existing (unscoped)
// referral queue below.
mountInterventionReviewRoutes(router, { roleName: ROLE_NAME, interventionTypeNames: ['Legal Aid'] });

router.get('/referrals', async (req, res) => {
  const { status } = req.query;
  if (status && !['Open', 'Resolved'].includes(status)) return fail(res, "status must be 'Open' or 'Resolved'", 400);

  const { rows } = await pool.query(
    `select ar.referral_id, ar.user_id, ar.reason, ar.status, ar.metadata, ar.created_at, ar.resolved_at,
            u.docket_number, ct.name as case_type_name
     from agency_referrals ar
     join users u on u.user_id = ar.user_id
     join case_types ct on ct.case_type_id = u.case_type_id
     where ar.referred_to_role = $1 ${status ? 'and ar.status = $2' : ''}
     order by ar.created_at desc`,
    status ? [ROLE_NAME, status] : [ROLE_NAME]
  );

  return ok(res, {
    referrals: rows.map((r) => ({
      referralId: r.referral_id,
      userId: r.user_id, // needed so this case's referral rows can raise a structured task (agency_tasks) targeting any concerned office
      docketNumber: r.docket_number,
      caseTypeName: r.case_type_name,
      reason: r.reason,
      status: r.status,
      metadata: r.metadata,
      createdAt: r.created_at,
      resolvedAt: r.resolved_at,
    })),
  });
});

async function loadOwnReferral(referralId, res) {
  const { rows } = await pool.query(
    `select ar.referral_id, ar.user_id, ar.reason, ar.status, ar.metadata, ar.created_at, ar.resolved_at,
            u.docket_number, ct.name as case_type_name
     from agency_referrals ar
     join users u on u.user_id = ar.user_id
     join case_types ct on ct.case_type_id = u.case_type_id
     where ar.referral_id = $1 and ar.referred_to_role = $2`,
    [referralId, ROLE_NAME]
  );
  if (!rows[0]) {
    fail(res, 'Referral not found', 404);
    return null;
  }
  return rows[0];
}

router.get('/referrals/:referralId', async (req, res) => {
  const referral = await loadOwnReferral(req.params.referralId, res);
  if (!referral) return;

  const { rows: notes } = await pool.query(
    `select n.note_id, n.note_text, n.created_at, o.full_name as author_name
     from agency_referral_notes n
     join officials o on o.official_id = n.author_official_id
     where n.referral_id = $1
     order by n.created_at asc`,
    [referral.referral_id]
  );

  return ok(res, {
    referralId: referral.referral_id,
    userId: referral.user_id, // needed so this case's referral rows can raise a structured task (agency_tasks) targeting any concerned office
    docketNumber: referral.docket_number,
    caseTypeName: referral.case_type_name,
    reason: referral.reason,
    status: referral.status,
    metadata: referral.metadata,
    createdAt: referral.created_at,
    resolvedAt: referral.resolved_at,
    notes: notes.map((n) => ({ noteId: n.note_id, noteText: n.note_text, createdAt: n.created_at, authorName: n.author_name })),
  });
});

router.post('/referrals/:referralId/notes', async (req, res) => {
  const referral = await loadOwnReferral(req.params.referralId, res);
  if (!referral) return;

  const { noteText } = req.body;
  if (!noteText || !String(noteText).trim()) return fail(res, 'noteText is required', 400);

  const { data, error } = await supabase
    .from('agency_referral_notes')
    .insert({ referral_id: referral.referral_id, author_official_id: req.auth.officialId, note_text: String(noteText).trim() })
    .select('note_id')
    .single();
  if (error) return fail(res, `Could not add note: ${error.message}`, 500);

  await writeAuditLog({ officialId: req.auth.officialId, action: 'create', entityType: 'agency_referral_note', entityId: data.note_id });

  return ok(res, { noteId: data.note_id }, 'Note added', 201);
});

// Records the assigned panel lawyer + a 48h SLA deadline computed from now(),
// merged into the referral's metadata jsonb - not a schema change, just data.
router.patch('/referrals/:referralId/assign-lawyer', async (req, res) => {
  const referral = await loadOwnReferral(req.params.referralId, res);
  if (!referral) return;

  const { lawyerName } = req.body;
  if (!lawyerName || !String(lawyerName).trim()) return fail(res, 'lawyerName is required', 400);

  const slaDeadline = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
  const newMetadata = { ...referral.metadata, assignedLawyer: String(lawyerName).trim(), slaDeadline };

  const { error } = await supabase.from('agency_referrals').update({ metadata: newMetadata }).eq('referral_id', referral.referral_id);
  if (error) return fail(res, `Could not assign lawyer: ${error.message}`, 500);

  await writeAuditLog({ officialId: req.auth.officialId, action: 'update', entityType: 'agency_referral', entityId: referral.referral_id });

  return ok(res, { referralId: referral.referral_id, metadata: newMetadata }, 'Lawyer assigned');
});

router.patch('/referrals/:referralId/resolve', async (req, res) => {
  const referral = await loadOwnReferral(req.params.referralId, res);
  if (!referral) return;
  if (referral.status === 'Resolved') return fail(res, 'This referral is already resolved', 400);

  const { error } = await supabase
    .from('agency_referrals')
    .update({ status: 'Resolved', resolved_at: new Date().toISOString() })
    .eq('referral_id', referral.referral_id);
  if (error) return fail(res, `Could not resolve referral: ${error.message}`, 500);

  await writeAuditLog({ officialId: req.auth.officialId, action: 'update', entityType: 'agency_referral', entityId: referral.referral_id });

  return ok(res, { referralId: referral.referral_id, status: 'Resolved' }, 'Referral resolved');
});

// mark-trial-ready (hand-off to Special Public Prosecutor) removed - SPP is
// retired as a separate login under the new consolidated Legal Aid flow.
// DLSA now carries a case through to resolution itself (assign counsel ->
// hearings tracked via the Case Journey/eCourt simulation -> reassign on
// poor feedback if needed -> Mark Resolved once concluded), rather than
// handing off partway through.


router.get('/tasks', async (req, res) => {
  const { status } = req.query;
  if (status && !['Pending', 'Completed'].includes(status)) return fail(res, "status must be 'Pending' or 'Completed'", 400);

  const { rows } = await pool.query(
    `select t.task_id, t.action, t.due_at, t.status, t.completed_at, t.auto_generated, t.created_at,
            t.source_referral_id, ar.referred_to_role as source_referral_role,
            u.docket_number, ct.name as case_type_name, o.full_name as created_by_name
     from agency_tasks t
     join users u on u.user_id = t.user_id
     join case_types ct on ct.case_type_id = u.case_type_id
     left join officials o on o.official_id = t.created_by_official_id
     left join agency_referrals ar on ar.referral_id = t.source_referral_id
     where t.assigned_to_role = $1 ${status ? 'and t.status = $2' : ''}
     order by (t.due_at is null), t.due_at asc, t.created_at desc`,
    status ? [ROLE_NAME, status] : [ROLE_NAME]
  );

  return ok(res, {
    tasks: rows.map((t) => ({
      taskId: t.task_id,
      docketNumber: t.docket_number,
      caseTypeName: t.case_type_name,
      action: t.action,
      dueAt: t.due_at,
      status: t.status,
      completedAt: t.completed_at,
      autoGenerated: t.auto_generated,
      createdByName: t.created_by_name || 'System (auto-escalated)',
      createdAt: t.created_at,
      overdue: t.status === 'Pending' && !!t.due_at && new Date(t.due_at) < new Date(),
      // Only usable as an in-app link when the source referral belongs to
      // THIS role's own queue (a task raised against another role's
      // referral - e.g. DC directing Protection Officer - is not something
      // this portal can open). The frontend checks sourceReferralRole
      // against its own role name before rendering "View Referral".
      sourceReferralId: t.source_referral_id,
      sourceReferralRole: t.source_referral_role,
    })),
  });
});

// ===== Structured tasks (migration_030_agency_tasks.sql) - INBOUND ONLY =====
// POST /tasks removed: this role delivers a service on a case and has no
// statutory authority to direct another department. Under the PoA Act the
// district officer who CAN issue cross-departmental directives is the
// District Collector (district executive head, chair of the Act's own
// district-level vigilance and monitoring committee) - that role keeps it.
// This capability was inherited from the shared role template rather than
// chosen for this role. A directive raised FOR this role is still listed
// and completed on the case it concerns.
router.patch('/tasks/:taskId/complete', async (req, res) => {
  const { rows } = await pool.query(
    'select task_id, status from agency_tasks where task_id = $1 and assigned_to_role = $2',
    [req.params.taskId, ROLE_NAME]
  );
  const task = rows[0];
  if (!task) return fail(res, 'Task not found', 404);
  if (task.status === 'Completed') return fail(res, 'This task is already completed', 400);

  const { error } = await supabase
    .from('agency_tasks')
    .update({ status: 'Completed', completed_at: new Date().toISOString() })
    .eq('task_id', task.task_id);
  if (error) return fail(res, `Could not complete task: ${error.message}`, 500);

  await writeAuditLog({ officialId: req.auth.officialId, action: 'update', entityType: 'agency_task', entityId: task.task_id });

  return ok(res, { taskId: task.task_id, status: 'Completed' }, 'Task marked complete');
});

// ===== Legal Aid Requests (migration_040, dedicated pipeline) =====
// Everything above (the generic intervention-review mount, /referrals*,
// /tasks*) is UNTOUCHED and stays exactly as it was - a case accepted under
// the old consolidated flow keeps working. This section is the real DLSA
// workflow: a 7-stage request lifecycle, jurisdiction-scoped (unlike the
// unscoped section above), representative assignment/reassignment with full
// history, and DLSA's own review of poor victim feedback.
//
// Jurisdiction-scoped the same way Protection Officer's own queue already
// is - self-filtered by the caller's own grant, never requireJurisdiction
// (that middleware resolves a TARGET resource's jurisdiction against the
// caller; this instead filters the caller's own queue, the same shape
// interventionRequestReview.js's jurisdictionScoped option already uses).
// An account with no jurisdiction assigned yet (pre-migration_040 accounts,
// until Ministry edits them one) sees an empty queue rather than an error -
// same graceful fallback that option already establishes.
function getOwnJurisdictionId(req) {
  const role = req.auth.roles.find((r) => r.roleName === ROLE_NAME);
  return role?.jurisdictionId || null;
}

const LEGAL_AID_STATUSES = ['Submitted', 'Under Review', 'Verified', 'Rejected', 'Approved', 'Active', 'Completed'];

async function loadOwnLegalAidRequest(req, res) {
  const jurisdictionId = getOwnJurisdictionId(req);
  if (!jurisdictionId) {
    fail(res, 'Request not found', 404);
    return null;
  }
  const { rows } = await pool.query(
    `select lar.request_id, lar.user_id, lar.reason, lar.description, lar.status, lar.rejection_reason,
            lar.reviewed_by_official_id, lar.reviewed_at, lar.created_at, lar.updated_at,
            u.docket_number, u.jurisdiction_id, u.case_stage, u.cnr_number, u.enrolled_at,
            ct.name as case_type_name, j.name as jurisdiction_name,
            ui.full_name as victim_full_name
     from legal_aid_requests lar
     join users u on u.user_id = lar.user_id
     join case_types ct on ct.case_type_id = u.case_type_id
     left join jurisdictions j on j.jurisdiction_id = u.jurisdiction_id
     left join user_identity ui on ui.user_id = coalesce(u.linked_to_user_id, u.user_id)
     where lar.request_id = $1`,
    [req.params.requestId]
  );
  const r = rows[0];
  if (!r || r.jurisdiction_id !== jurisdictionId) {
    fail(res, 'Request not found', 404);
    return null;
  }
  return r;
}

router.get('/legal-aid-requests', async (req, res) => {
  const { status } = req.query;
  if (status && !LEGAL_AID_STATUSES.includes(status)) return fail(res, `status must be one of: ${LEGAL_AID_STATUSES.join(', ')}`, 400);

  const jurisdictionId = getOwnJurisdictionId(req);
  if (!jurisdictionId) return ok(res, { requests: [], jurisdictionAssigned: false });

  const params = [jurisdictionId];
  let where = 'u.jurisdiction_id = $1';
  if (status) { params.push(status); where += ` and lar.status = $${params.length}`; }

  // latestAssignmentStatus - the one signal that distinguishes a genuinely
  // NEW request (never assigned) from one that WAS assigned and had its
  // Public Prosecutor reject the case (request.status reverts to 'Under
  // Review' either way - see the reject route's own comment on why nothing
  // else marks this) - the Legal Aid Requests queue uses this to show a
  // "Public Prosecutor rejected - needs reassignment" flag on the latter.
  const { rows } = await pool.query(
    `select lar.request_id, lar.reason, lar.status, lar.created_at, lar.updated_at,
            u.docket_number, u.case_stage, ct.name as case_type_name, ui.full_name as victim_name,
            latest.status as latest_assignment_status
     from legal_aid_requests lar
     join users u on u.user_id = lar.user_id
     join case_types ct on ct.case_type_id = u.case_type_id
     left join user_identity ui on ui.user_id = coalesce(u.linked_to_user_id, u.user_id)
     left join lateral (
       select status from legal_aid_assignments where request_id = lar.request_id order by assigned_at desc limit 1
     ) latest on true
     where ${where}
     order by lar.created_at desc`,
    params
  );

  return ok(res, {
    jurisdictionAssigned: true,
    requests: rows.map((r) => ({
      requestId: r.request_id,
      docketNumber: r.docket_number,
      victimName: r.victim_name || null,
      caseTypeName: r.case_type_name,
      caseStage: r.case_stage,
      reason: r.reason,
      status: r.status,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      needsReassignment: r.latest_assignment_status === 'Rejected',
    })),
  });
});

router.get('/legal-aid-requests/:requestId', async (req, res) => {
  const request = await loadOwnLegalAidRequest(req, res);
  if (!request) return;

  const { rows: identityRows } = await pool.query(
    `select ui.full_name, ui.contact_number, ui.address
     from users u left join user_identity ui on ui.user_id = coalesce(u.linked_to_user_id, u.user_id)
     where u.user_id = $1`,
    [request.user_id]
  );
  const identity = identityRows[0] || {};

  const documents = await loadRequestDocuments(request.request_id);

  const { rows: assignments } = await pool.query(
    `select laa.assignment_id, laa.representative_official_id, laa.status, laa.assigned_at, laa.ended_at, laa.ended_reason,
            o.full_name as representative_name, orr.designation
     from legal_aid_assignments laa
     join officials o on o.official_id = laa.representative_official_id
     left join official_roles orr on orr.official_id = o.official_id and orr.revoked_at is null
     left join roles r on r.role_id = orr.role_id and r.role_name = 'Public Prosecutor'
     where laa.request_id = $1
     order by laa.assigned_at asc`,
    [request.request_id]
  );

  // migration_044: past hearings are eCourt-only now (requirement 8) -
  // never a DLSA/PP-authored record - see legalAidHearingTimeline.js's own
  // header comment.
  const hearingTimeline = await loadHearingTimeline({
    requestId: request.request_id,
    userId: request.user_id,
    caseStage: request.case_stage,
    docketNumber: request.docket_number,
    cnrNumber: request.cnr_number,
    caseTypeName: request.case_type_name,
    jurisdictionName: request.jurisdiction_name,
    enrolledAt: request.enrolled_at,
    victimFullName: request.victim_full_name,
  });

  await writeAuditLog({ officialId: req.auth.officialId, action: 'read', entityType: 'legal_aid_request', entityId: request.request_id });
  await writeAuditLog({ officialId: req.auth.officialId, userId: request.user_id, action: 'read', entityType: 'victim_contact_details', entityId: request.request_id });

  return ok(res, {
    requestId: request.request_id,
    docketNumber: request.docket_number,
    caseTypeName: request.case_type_name,
    caseStage: request.case_stage,
    reason: request.reason,
    description: request.description,
    status: request.status,
    rejectionReason: request.rejection_reason,
    createdAt: request.created_at,
    updatedAt: request.updated_at,
    victimName: identity.full_name || null,
    victimContactNumber: identity.contact_number || null,
    victimAddress: identity.address || null,
    documents,
    assignments: assignments.map((a) => ({
      assignmentId: a.assignment_id,
      representativeOfficialId: a.representative_official_id,
      status: a.status,
      representativeName: a.representative_name,
      designation: a.designation,
      assignedAt: a.assigned_at,
      endedAt: a.ended_at,
      endedReason: a.ended_reason,
    })),
    hearingTimeline,
  });
});

// Shared by every PATCH transition below - validates current status, applies
// the update, stamps reviewed_by/reviewed_at + updated_at, and writes the
// audit trail entry (the real per-transition history - see migration_040's
// own comment on why the request row's reviewed_by/reviewed_at can only ever
// hold the MOST RECENT of these).
async function applyLegalAidTransition(req, res, request, { fromStatus, toStatus, extraSet = {}, extraParams = [], note }) {
  if (request.status !== fromStatus) {
    fail(res, `This request must be '${fromStatus}' for this action (currently '${request.status}')`, 400);
    return false;
  }
  const setClauses = ['status = $1', 'reviewed_by_official_id = $2', 'reviewed_at = now()', 'updated_at = now()'];
  const params = [toStatus, req.auth.officialId];
  let i = params.length;
  for (const [col, val] of Object.entries(extraSet)) {
    i += 1;
    setClauses.push(`${col} = $${i}`);
    params.push(val);
  }
  params.push(request.request_id);
  await pool.query(`update legal_aid_requests set ${setClauses.join(', ')} where request_id = $${params.length}`, params);

  await writeAuditLog({
    officialId: req.auth.officialId,
    userId: request.user_id,
    action: 'update',
    entityType: 'legal_aid_request',
    entityId: request.request_id,
    details: { fromStatus, toStatus, note: note || null },
  });
  return true;
}

router.patch('/legal-aid-requests/:requestId/start-review', async (req, res) => {
  const request = await loadOwnLegalAidRequest(req, res);
  if (!request) return;
  const applied = await applyLegalAidTransition(req, res, request, { fromStatus: 'Submitted', toStatus: 'Under Review' });
  if (!applied) return;
  return ok(res, { requestId: request.request_id, status: 'Under Review' }, 'Review started');
});

// Only reachable from 'Under Review', matching the simplified 4-stage flow
// exactly (Submitted -> Under Review -> Active -> Completed, or -> Rejected
// from Under Review) - migration_043 retired the 'Verify'/'Approve' steps
// that used to sit between this and assign-representative below; nothing
// else in the review path changed.
router.patch('/legal-aid-requests/:requestId/reject', async (req, res) => {
  const request = await loadOwnLegalAidRequest(req, res);
  if (!request) return;
  const { reason } = req.body;
  if (!reason || !String(reason).trim()) return fail(res, 'A reason is required to reject a request', 400);
  const applied = await applyLegalAidTransition(req, res, request, {
    fromStatus: 'Under Review', toStatus: 'Rejected',
    extraSet: { rejection_reason: String(reason).trim() },
  });
  if (!applied) return;
  return ok(res, { requestId: request.request_id, status: 'Rejected' }, 'Request rejected');
});

// Active Public Prosecutor officials in this request's own jurisdiction,
// with their current Active caseload - the assign/reassign UI's picker.
router.get('/legal-aid-requests/:requestId/eligible-representatives', async (req, res) => {
  const request = await loadOwnLegalAidRequest(req, res);
  if (!request) return;

  const { rows } = await pool.query(
    `select o.official_id, o.full_name, orr.designation,
            (select count(*) from legal_aid_assignments laa where laa.representative_official_id = o.official_id and laa.status = 'Active') as active_case_count
     from officials o
     join official_roles orr on orr.official_id = o.official_id and orr.revoked_at is null
     join roles r on r.role_id = orr.role_id
     where r.role_name = 'Public Prosecutor' and orr.jurisdiction_id = $1
     order by o.full_name`,
    [request.jurisdiction_id]
  );

  return ok(res, {
    representatives: rows.map((r) => ({
      officialId: r.official_id,
      fullName: r.full_name,
      designation: r.designation,
      activeCaseCount: Number(r.active_case_count),
    })),
  });
});

async function isEligibleRepresentative(officialId, jurisdictionId) {
  const { rows } = await pool.query(
    `select 1 from official_roles orr
     join roles r on r.role_id = orr.role_id
     where orr.official_id = $1 and orr.revoked_at is null and r.role_name = 'Public Prosecutor' and orr.jurisdiction_id = $2`,
    [officialId, jurisdictionId]
  );
  return rows.length > 0;
}

// migration_044: assigning a Public Prosecutor no longer activates the
// request by itself - the request stays 'Under Review' until that Public
// Prosecutor actually ACCEPTS (legalRepresentative.routes.js's own
// POST .../accept, which is the only place request.status ever becomes
// 'Active' now). This creates the assignment as 'Pending Acceptance' and
// leaves it to them; reviewed_by/reviewed_at are still stamped here since
// DLSA did act, just not the status column.
router.post('/legal-aid-requests/:requestId/assign-representative', async (req, res) => {
  const request = await loadOwnLegalAidRequest(req, res);
  if (!request) return;
  if (request.status !== 'Under Review') return fail(res, `This request must be 'Under Review' for this action (currently '${request.status}')`, 400);

  const { representativeOfficialId } = req.body;
  if (!representativeOfficialId) return fail(res, 'representativeOfficialId is required', 400);
  if (!(await isEligibleRepresentative(representativeOfficialId, request.jurisdiction_id))) {
    return fail(res, 'That official is not an active Public Prosecutor in this jurisdiction', 400);
  }

  let assignmentId;
  try {
    assignmentId = await withTransaction(async (client) => {
      await client.query(
        `update legal_aid_requests set reviewed_by_official_id = $1, reviewed_at = now(), updated_at = now() where request_id = $2`,
        [req.auth.officialId, request.request_id]
      );
      const { rows } = await client.query(
        `insert into legal_aid_assignments (request_id, representative_official_id, assigned_by_official_id)
         values ($1, $2, $3) returning assignment_id`,
        [request.request_id, representativeOfficialId, req.auth.officialId]
      );
      return rows[0].assignment_id;
    });
  } catch (err) {
    return fail(res, `Could not assign representative: ${err.message}`, 500);
  }

  await writeAuditLog({
    officialId: req.auth.officialId, action: 'create', entityType: 'legal_aid_assignment', entityId: assignmentId,
    details: { note: 'Public Prosecutor assigned - pending their acceptance' },
  });

  const { error: notifyError } = await supabase.from('alert_notifications').insert({ user_id: request.user_id, official_id: representativeOfficialId, source: 'legal_aid', priority: 'normal' });
  if (notifyError) console.error('assign-representative: could not notify representative', notifyError.message, { assignmentId });

  return ok(res, { requestId: request.request_id, status: request.status, assignmentId }, 'Public Prosecutor assigned - awaiting their acceptance');
});

// Reassignment within an Active request - does not change the request's own
// status. Usable standalone - also how a representative whose account has
// been revoked mid-case gets replaced (see ministry.routes.js's own
// revoke-time notification).
router.post('/legal-aid-requests/:requestId/reassign', async (req, res) => {
  const request = await loadOwnLegalAidRequest(req, res);
  if (!request) return;
  if (request.status !== 'Active') return fail(res, `This request must be 'Active' to reassign a representative (currently '${request.status}')`, 400);

  const { newRepresentativeOfficialId, endedReason } = req.body;
  if (!newRepresentativeOfficialId) return fail(res, 'newRepresentativeOfficialId is required', 400);
  if (!endedReason || !String(endedReason).trim()) return fail(res, 'endedReason is required', 400);
  if (!(await isEligibleRepresentative(newRepresentativeOfficialId, request.jurisdiction_id))) {
    return fail(res, 'That official is not an active Public Prosecutor in this jurisdiction', 400);
  }

  let result;
  try {
    result = await withTransaction(async (client) => {
      const { rows: currentRows } = await client.query(
        `select assignment_id, representative_official_id from legal_aid_assignments where request_id = $1 and status = 'Active' for update`,
        [request.request_id]
      );
      const current = currentRows[0];
      if (!current) throw new Error('No active representative found to reassign');
      if (current.representative_official_id === newRepresentativeOfficialId) throw new Error('That representative is already assigned to this case');

      await client.query(
        `update legal_aid_assignments set status = 'Reassigned', ended_reason = $1, ended_at = now() where assignment_id = $2`,
        [String(endedReason).trim(), current.assignment_id]
      );
      // New assignment starts 'Pending Acceptance' same as a first-time
      // assignment (the table's own default) - a reassigned Public
      // Prosecutor gets the same Accept/Reject step as any other.
      const { rows: newRows } = await client.query(
        `insert into legal_aid_assignments (request_id, representative_official_id, assigned_by_official_id)
         values ($1, $2, $3) returning assignment_id`,
        [request.request_id, newRepresentativeOfficialId, req.auth.officialId]
      );
      await client.query(`update legal_aid_requests set updated_at = now() where request_id = $1`, [request.request_id]);
      return { oldAssignmentId: current.assignment_id, newAssignmentId: newRows[0].assignment_id, oldRepresentativeOfficialId: current.representative_official_id };
    });
  } catch (err) {
    return fail(res, `Could not reassign Public Prosecutor: ${err.message}`, 400);
  }

  await writeAuditLog({
    officialId: req.auth.officialId, userId: request.user_id, action: 'update', entityType: 'legal_aid_assignment', entityId: result.newAssignmentId,
    details: { note: 'Reassigned', oldAssignmentId: result.oldAssignmentId, reason: String(endedReason).trim() },
  });

  const { error: notifyError } = await supabase.from('alert_notifications').insert([
    { user_id: request.user_id, official_id: newRepresentativeOfficialId, source: 'legal_aid', priority: 'normal' },
    { user_id: request.user_id, official_id: result.oldRepresentativeOfficialId, source: 'legal_aid', priority: 'normal' },
  ]);
  if (notifyError) console.error('reassign: could not notify representatives', notifyError.message, { requestId: request.request_id });

  return ok(res, { requestId: request.request_id, newAssignmentId: result.newAssignmentId }, 'Public Prosecutor reassigned');
});

// "Mark Complete" (Active -> Completed) is deliberately gone, per explicit
// product request: assigning a Public Prosecutor is not DLSA declaring the
// case done, and there is no other real-world moment during this flow that
// is either - only the underlying court case's own eCourt-reported stage
// (case_stage - see ecourtStageSync.js, the sole writer of it) says when a
// case is actually closed, and that's an entirely separate fact from this
// Legal Aid request's own status. A request assigned a Public Prosecutor now
// simply stays 'Active' - tracking "does this case currently have a Public
// Prosecutor working it" - for as long as the underlying case runs; there is
// no DLSA-driven terminal step here any more (Rejected, at intake, remains
// the only status DLSA can put a request into on their own).

module.exports = router;
