const express = require('express');
const { supabase } = require('../../core/db/supabaseClient');
const { pool } = require('../../core/db/pgPool');
const { writeAuditLog } = require('../../core/services/auditLog');
const { verifyToken } = require('../../core/middleware/verifyToken');
const { requireRole } = require('../../core/middleware/requireRole');
const { generalApiLimiter } = require('../../core/middleware/rateLimiter');
const { ok, fail } = require('../../core/services/responseEnvelope');
const { computeThreatTier, getSosEventCounts, getSosEventCount } = require('../../core/services/threatAssessment');

const router = express.Router();

// Protection Officer - copied from dwo/routes/dwo.routes.js (the template);
// only ROLE_NAME differs. Weekly safety-verification log as notes - the
// frontend surfaces the most recent note's createdAt as "last verified".
// Also reads (never sets) the Threat Tier Investigating Officer assessed on
// this same case - a read-only cross-referral lookup, same pattern as
// District Collector's otherAgencyReferrals, just scoped to one role and
// one field instead of everything. Protection Officer picks its own
// protection type based on this, rather than guessing a number itself.
const ROLE_NAME = 'Protection Officer';

// Looks up the latest Investigating Officer referral for this same case (if
// any) and returns the resulting Threat Tier - null accusedStatus/tier when
// IO has not yet logged an assessment, so the frontend can say so plainly
// rather than showing a misleading default.
async function getThreatAssessment(userId, caseTypeName) {
  const { rows } = await pool.query(
    `select metadata from agency_referrals
     where user_id = $1 and referred_to_role = 'Investigating Officer'
     order by created_at desc limit 1`,
    [userId]
  );
  if (!rows[0]) return { accusedStatus: null, threatTier: null };
  const accusedStatus = rows[0].metadata?.accusedStatus || null;
  if (!accusedStatus) return { accusedStatus: null, threatTier: null };
  const sosEventCount7d = await getSosEventCount(userId, 7);
  return { accusedStatus, threatTier: computeThreatTier({ accusedStatus, caseTypeName, sosEventCount7d }) };
}

router.use(verifyToken, requireRole([ROLE_NAME]), generalApiLimiter);

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

  // One batched query for every case's latest IO referral, instead of one
  // query per row - same discipline as getSosEventCounts below.
  const userIds = rows.map((r) => r.user_id);
  let ioMetadataByUser = {};
  if (userIds.length > 0) {
    const { rows: ioRows } = await pool.query(
      `select distinct on (user_id) user_id, metadata
       from agency_referrals
       where user_id = any($1) and referred_to_role = 'Investigating Officer'
       order by user_id, created_at desc`,
      [userIds]
    );
    ioMetadataByUser = ioRows.reduce((acc, r) => { acc[r.user_id] = r.metadata; return acc; }, {});
  }
  const sosCounts = await getSosEventCounts(userIds, 7);

  return ok(res, {
    referrals: rows.map((r) => {
      const accusedStatus = ioMetadataByUser[r.user_id]?.accusedStatus || null;
      return {
        referralId: r.referral_id,
        userId: r.user_id, // needed so this case's referral rows can raise a structured task (agency_tasks) targeting any concerned office
        docketNumber: r.docket_number,
        caseTypeName: r.case_type_name,
        reason: r.reason,
        status: r.status,
        metadata: r.metadata,
        createdAt: r.created_at,
        resolvedAt: r.resolved_at,
        accusedStatus,
        threatTier: accusedStatus
          ? computeThreatTier({ accusedStatus, caseTypeName: r.case_type_name, sosEventCount7d: sosCounts[r.user_id] || 0 })
          : null,
      };
    }),
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

  const threatAssessment = await getThreatAssessment(referral.user_id, referral.case_type_name);

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
    lastVerifiedAt: notes.length ? notes[notes.length - 1].created_at : null,
    notes: notes.map((n) => ({ noteId: n.note_id, noteText: n.note_text, createdAt: n.created_at, authorName: n.author_name })),
    accusedStatus: threatAssessment.accusedStatus,
    threatTier: threatAssessment.threatTier,
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

// ===== Structured tasks (migration_030_agency_tasks.sql) =====
// Real action items - a specific role, a specific action, a due date, a
// Pending/Completed status - instead of a free-text note only the reader
// happens to see. Copied from dwo/routes/dwo.routes.js's template. Any role
// can create a task targeting any role (not just its own referrals' role) -
// e.g. District Collector directing Protection Officer to act, or DWO
// flagging something for Rehabilitation Officer.
const TASK_ASSIGNABLE_ROLES = [
  'District Welfare Officer', 'Investigating Officer', 'Protection Officer',
  'DLSA Coordinator', 'Special Public Prosecutor', 'District Collector', 'Rehabilitation Officer',
];

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

router.post('/tasks', async (req, res) => {
  const { userId, assignedToRole, action, dueAt, sourceReferralId } = req.body;
  if (!userId || !assignedToRole || !action || !String(action).trim()) {
    return fail(res, 'userId, assignedToRole, and action are required', 400);
  }
  if (!TASK_ASSIGNABLE_ROLES.includes(assignedToRole)) {
    return fail(res, `assignedToRole must be one of: ${TASK_ASSIGNABLE_ROLES.join(', ')}`, 400);
  }

  const { rows: userRows } = await pool.query('select user_id from users where user_id = $1', [userId]);
  if (!userRows[0]) return fail(res, 'Case not found', 404);

  const { data, error } = await supabase
    .from('agency_tasks')
    .insert({
      user_id: userId,
      source_referral_id: sourceReferralId || null,
      assigned_to_role: assignedToRole,
      created_by_official_id: req.auth.officialId,
      action: String(action).trim(),
      due_at: dueAt || null,
    })
    .select('task_id')
    .single();
  if (error) return fail(res, `Could not create task: ${error.message}`, 500);

  await writeAuditLog({ officialId: req.auth.officialId, action: 'create', entityType: 'agency_task', entityId: data.task_id });

  return ok(res, { taskId: data.task_id }, 'Task created', 201);
});

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
