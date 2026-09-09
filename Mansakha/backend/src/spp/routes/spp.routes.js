const express = require('express');
const { supabase } = require('../../core/db/supabaseClient');
const { pool } = require('../../core/db/pgPool');
const { writeAuditLog } = require('../../core/services/auditLog');
const { verifyToken } = require('../../core/middleware/verifyToken');
const { requireRole } = require('../../core/middleware/requireRole');
const { generalApiLimiter } = require('../../core/middleware/rateLimiter');
const { ok, fail } = require('../../core/services/responseEnvelope');

const router = express.Router();

// Special Public Prosecutor - copied from dwo/routes/dwo.routes.js (the
// template); ROLE_NAME differs, and this role additionally gets PATCH
// .../hearing-requested and PATCH .../outcome (agency_referrals.metadata
// jsonb, same data-driven pattern as DLSA's assign-lawyer).
const ROLE_NAME = 'Special Public Prosecutor';

// Real docket stages (Docket Received -> Hearing Scheduled -> Verdict
// Delivered), derived from existing signals rather than stored separately -
// same discipline as DWO's complianceStatus and core/services/
// threatAssessment.js's Threat Tier. Never recomputed into `status`, which
// stays the plain Open/Resolved gate the escalation checker and District
// Collector's cross-agency view already rely on.
function computeStage(metadata) {
  if (metadata?.caseOutcome) return 'Verdict Delivered';
  if (metadata?.hearingRequested) return 'Hearing Scheduled';
  return 'Docket Received';
}

// Case Priority - the real "Special Court Docket... prioritized by victim
// distress level and case age (older cases flagged red)" feature. Distress
// thresholds match the live scoring pipeline's own bands (ai/scoring.js:
// 30/55/80), not invented ones.
const OLD_CASE_DAYS = 30;
const AGING_CASE_DAYS = 14;
const HIGH_DISTRESS_THRESHOLD = 55;

function computeCasePriority(caseAgeDays, distressScore) {
  const highDistress = distressScore != null && distressScore >= HIGH_DISTRESS_THRESHOLD;
  if (caseAgeDays > OLD_CASE_DAYS && highDistress) return 'High';
  if (caseAgeDays > AGING_CASE_DAYS || highDistress) return 'Elevated';
  return 'Standard';
}

async function getLatestDistressScores(userIds) {
  if (!userIds || userIds.length === 0) return {};
  const { rows } = await pool.query(
    `select distinct on (user_id) user_id, score_value
     from distress_scores
     where user_id = any($1)
     order by user_id, computed_at desc`,
    [userIds]
  );
  return rows.reduce((acc, r) => { acc[r.user_id] = Number(r.score_value); return acc; }, {});
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

  const distressByUser = await getLatestDistressScores(rows.map((r) => r.user_id));

  return ok(res, {
    referrals: rows.map((r) => {
      const caseAgeDays = Math.floor((Date.now() - new Date(r.created_at).getTime()) / 86400000);
      const distressScore = distressByUser[r.user_id] ?? null;
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
        stage: computeStage(r.metadata),
        caseAgeDays,
        distressScore,
        casePriority: computeCasePriority(caseAgeDays, distressScore),
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

  const caseAgeDays = Math.floor((Date.now() - new Date(referral.created_at).getTime()) / 86400000);
  const distressByUser = await getLatestDistressScores([referral.user_id]);
  const distressScore = distressByUser[referral.user_id] ?? null;

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
    stage: computeStage(referral.metadata),
    caseAgeDays,
    distressScore,
    casePriority: computeCasePriority(caseAgeDays, distressScore),
    testimonyAccommodation: referral.metadata?.testimonyAccommodation || 'None',
    caseOutcome: referral.metadata?.caseOutcome || null,
  });
});

// Victim Testimony Coordination - a real structured request instead of a
// free-text note, per the PS's own "requests video-conferencing or screen
// barriers for traumatized victims" feature.
const TESTIMONY_ACCOMMODATIONS = ['None', 'Video Conferencing', 'Screen Barrier'];

router.patch('/referrals/:referralId/testimony-accommodation', async (req, res) => {
  const referral = await loadOwnReferral(req.params.referralId, res);
  if (!referral) return;

  const { testimonyAccommodation } = req.body;
  if (!TESTIMONY_ACCOMMODATIONS.includes(testimonyAccommodation)) {
    return fail(res, `testimonyAccommodation must be one of: ${TESTIMONY_ACCOMMODATIONS.join(', ')}`, 400);
  }

  const newMetadata = { ...referral.metadata, testimonyAccommodation };
  const { error } = await supabase.from('agency_referrals').update({ metadata: newMetadata }).eq('referral_id', referral.referral_id);
  if (error) return fail(res, `Could not update testimony accommodation: ${error.message}`, 500);

  await writeAuditLog({ officialId: req.auth.officialId, action: 'update', entityType: 'agency_referral', entityId: referral.referral_id });

  return ok(res, { referralId: referral.referral_id, testimonyAccommodation }, 'Testimony accommodation updated');
});

// Structured Case Outcome - verdict, sentence, compensation, AND a property
// forfeiture flag (SC/ST PoA Act Chapter provision: on conviction, the
// Special Court may declare property used in the offence forfeited to
// Government). Kept as a new metadata.caseOutcome object rather than
// overloading the existing metadata.outcome string, so no existing data's
// shape changes - that route/field is left exactly as it was.
const VERDICTS = ['Conviction', 'Acquittal'];

router.patch('/referrals/:referralId/case-outcome', async (req, res) => {
  const referral = await loadOwnReferral(req.params.referralId, res);
  if (!referral) return;

  const { verdict, sentence, compensationAwarded, forfeitureOrdered } = req.body;
  if (!VERDICTS.includes(verdict)) return fail(res, `verdict must be one of: ${VERDICTS.join(', ')}`, 400);
  if (compensationAwarded !== undefined && compensationAwarded !== null && (typeof compensationAwarded !== 'number' || compensationAwarded < 0)) {
    return fail(res, 'compensationAwarded must be a non-negative number', 400);
  }

  const caseOutcome = {
    verdict,
    sentence: sentence ? String(sentence).trim() : null,
    compensationAwarded: compensationAwarded ?? null,
    forfeitureOrdered: forfeitureOrdered === true,
    recordedAt: new Date().toISOString(),
  };
  const newMetadata = { ...referral.metadata, caseOutcome };
  const { error } = await supabase.from('agency_referrals').update({ metadata: newMetadata }).eq('referral_id', referral.referral_id);
  if (error) return fail(res, `Could not record case outcome: ${error.message}`, 500);

  await writeAuditLog({ officialId: req.auth.officialId, action: 'update', entityType: 'agency_referral', entityId: referral.referral_id });

  return ok(res, { referralId: referral.referral_id, caseOutcome }, 'Case outcome recorded - the justice loop is now closed for this case');
});

// Every task raised against this case, regardless of which role created it
// or which role it's assigned to - so a case's Tasks page shows the whole
// directive picture, not just this role's own. Mirrors dwo.routes.js.
router.get('/referrals/:referralId/tasks', async (req, res) => {
  const referral = await loadOwnReferral(req.params.referralId, res);
  if (!referral) return;

  const { rows } = await pool.query(
    `select t.task_id, t.assigned_to_role, t.action, t.due_at, t.status, t.completed_at,
            t.auto_generated, t.created_at, o.full_name as created_by_name
     from agency_tasks t
     left join officials o on o.official_id = t.created_by_official_id
     where t.source_referral_id = $1
     order by (t.due_at is null), t.due_at asc, t.created_at desc`,
    [referral.referral_id]
  );

  return ok(res, {
    tasks: rows.map((t) => ({
      taskId: t.task_id,
      assignedToRole: t.assigned_to_role,
      action: t.action,
      dueAt: t.due_at,
      status: t.status,
      completedAt: t.completed_at,
      autoGenerated: t.auto_generated,
      createdByName: t.created_by_name || 'System (auto-escalated)',
      createdAt: t.created_at,
      overdue: t.status === 'Pending' && !!t.due_at && new Date(t.due_at) < new Date(),
    })),
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

router.patch('/referrals/:referralId/hearing-requested', async (req, res) => {
  const referral = await loadOwnReferral(req.params.referralId, res);
  if (!referral) return;

  const newMetadata = { ...referral.metadata, hearingRequested: true, hearingRequestedAt: new Date().toISOString() };
  const { error } = await supabase.from('agency_referrals').update({ metadata: newMetadata }).eq('referral_id', referral.referral_id);
  if (error) return fail(res, `Could not record hearing request: ${error.message}`, 500);

  await writeAuditLog({ officialId: req.auth.officialId, action: 'update', entityType: 'agency_referral', entityId: referral.referral_id });

  return ok(res, { referralId: referral.referral_id, metadata: newMetadata }, 'Expedited hearing request filed');
});

router.patch('/referrals/:referralId/outcome', async (req, res) => {
  const referral = await loadOwnReferral(req.params.referralId, res);
  if (!referral) return;

  const { outcome } = req.body;
  if (!outcome || !String(outcome).trim()) return fail(res, 'outcome is required', 400);

  const newMetadata = { ...referral.metadata, outcome: String(outcome).trim() };
  const { error } = await supabase.from('agency_referrals').update({ metadata: newMetadata }).eq('referral_id', referral.referral_id);
  if (error) return fail(res, `Could not record outcome: ${error.message}`, 500);

  await writeAuditLog({ officialId: req.auth.officialId, action: 'update', entityType: 'agency_referral', entityId: referral.referral_id });

  return ok(res, { referralId: referral.referral_id, metadata: newMetadata }, 'Outcome recorded');
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

  const { rows: userRows } = await pool.query('select user_id, case_stage from users where user_id = $1', [userId]);
  if (!userRows[0]) return fail(res, 'Case not found', 404);
  // migration_034: Rehabilitation Officer's mandate begins once the case
  // reaches the Rehabilitation eCourt stage (same rule as
  // dwo.routes.js's hand-off-rehabilitation) - a task raised before that
  // would sit in the officer's queue for a case they have no access to.
  // (This route is currently unmounted/unreachable - SPP was retired as a
  // separate login - kept consistent anyway in case it's ever revived.)
  if (assignedToRole === 'Rehabilitation Officer' && userRows[0].case_stage !== 'Rehabilitation') {
    return fail(res, "Rehabilitation Officer's role begins only once the case reaches the Rehabilitation stage. Kindly assign this to a different office, or raise it again once the case reaches that stage.", 400);
  }

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
