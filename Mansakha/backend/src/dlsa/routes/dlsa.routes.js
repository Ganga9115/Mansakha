const express = require('express');
const { supabase } = require('../../core/db/supabaseClient');
const { pool } = require('../../core/db/pgPool');
const { writeAuditLog } = require('../../core/services/auditLog');
const { verifyToken } = require('../../core/middleware/verifyToken');
const { requireRole } = require('../../core/middleware/requireRole');
const { generalApiLimiter } = require('../../core/middleware/rateLimiter');
const { ok, fail } = require('../../core/services/responseEnvelope');
const { mountInterventionReviewRoutes } = require('../../core/services/interventionRequestReview');

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

module.exports = router;
