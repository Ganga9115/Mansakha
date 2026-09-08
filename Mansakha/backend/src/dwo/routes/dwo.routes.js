const express = require('express');
const { supabase } = require('../../core/db/supabaseClient');
const { pool } = require('../../core/db/pgPool');
const { writeAuditLog } = require('../../core/services/auditLog');
const { verifyToken } = require('../../core/middleware/verifyToken');
const { requireRole } = require('../../core/middleware/requireRole');
const { generalApiLimiter } = require('../../core/middleware/rateLimiter');
const { ok, fail } = require('../../core/services/responseEnvelope');

const router = express.Router();

// District Welfare Officer - works the agency_referrals queue District Admin
// creates for it (migration_028_agency_referrals.sql). THE TEMPLATE for the
// other new-role route files (io, protection_officer, dlsa, spp,
// district_collector, rehabilitation_officer) - same core 4 routes, just a
// different requireRole / referred_to_role filter per role. District
// Collector's copy additionally fetches sibling referrals for the same case
// from every other role - see that file's own GET /referrals/:referralId
// for that one real difference.
//
// Never exposes a victim's full_name/contact - docket-number identification
// only, same privacy boundary as every existing officials-side route.
const ROLE_NAME = 'District Welfare Officer';

// Relief & Compliance - real structured fields (not a free-text guess) for
// DWO's actual statutory function: relief type, sanctioned amount, and a
// 7-day statutory compliance flag (relief not yet sanctioned within 7 days
// of registration). Computed fresh on every read, same discipline as
// core/services/threatAssessment.js's Threat Tier - never stored as a
// stale label.
const RELIEF_TYPES = ['Interim Relief', 'Final Relief', 'Rehabilitation Grant'];
const STATUTORY_COMPLIANCE_DAYS = 7;

function computeCompliance(metadata, createdAt) {
  if (metadata?.sanctionedAt) return 'Sanctioned';
  const daysOpen = Math.floor((Date.now() - new Date(createdAt).getTime()) / 86400000);
  return daysOpen > STATUTORY_COMPLIANCE_DAYS ? 'Overdue' : 'On Track';
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
      reliefType: r.metadata?.reliefType || null,
      reliefAmount: r.metadata?.reliefAmount || null,
      complianceStatus: computeCompliance(r.metadata, r.created_at),
    })),
  });
});

async function loadOwnReferral(referralId, res) {
  const { rows } = await pool.query(
    `select ar.referral_id, ar.user_id, ar.reason, ar.status, ar.metadata, ar.created_at, ar.resolved_at,
            u.docket_number, u.case_stage, ct.name as case_type_name
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
    userId: referral.user_id,
    docketNumber: referral.docket_number,
    caseTypeName: referral.case_type_name,
    reason: referral.reason,
    status: referral.status,
    metadata: referral.metadata,
    createdAt: referral.created_at,
    resolvedAt: referral.resolved_at,
    notes: notes.map((n) => ({ noteId: n.note_id, noteText: n.note_text, createdAt: n.created_at, authorName: n.author_name })),
    reliefType: referral.metadata?.reliefType || null,
    reliefAmount: referral.metadata?.reliefAmount || null,
    sanctionedAt: referral.metadata?.sanctionedAt || null,
    complianceStatus: computeCompliance(referral.metadata, referral.created_at),
    // Rehabilitation Officer's mandate only begins after case closure (see
    // hand-off-rehabilitation below) - exposed so the Assign Task form can
    // hide that option as a target until then, rather than offering a
    // directive the officer has no case access to yet.
    rehabilitationEligible: referral.case_stage === 'Case Closed',
  });
});

// Sets/updates the relief type and amount, and can mark it sanctioned (the
// event that resolves the statutory-compliance flag). A real structured
// action, not a note - DWO's actual "Fast-Track Approval Workflow".
router.patch('/referrals/:referralId/relief', async (req, res) => {
  const referral = await loadOwnReferral(req.params.referralId, res);
  if (!referral) return;

  const { reliefType, reliefAmount, sanctioned } = req.body;
  if (reliefType !== undefined && !RELIEF_TYPES.includes(reliefType)) {
    return fail(res, `reliefType must be one of: ${RELIEF_TYPES.join(', ')}`, 400);
  }
  if (reliefAmount !== undefined && (typeof reliefAmount !== 'number' || reliefAmount <= 0)) {
    return fail(res, 'reliefAmount must be a positive number', 400);
  }

  const nextMetadata = { ...referral.metadata };
  if (reliefType !== undefined) nextMetadata.reliefType = reliefType;
  if (reliefAmount !== undefined) nextMetadata.reliefAmount = reliefAmount;
  if (sanctioned === true && !nextMetadata.sanctionedAt) nextMetadata.sanctionedAt = new Date().toISOString();

  const { error } = await supabase
    .from('agency_referrals')
    .update({ metadata: nextMetadata })
    .eq('referral_id', referral.referral_id);
  if (error) return fail(res, `Could not update relief details: ${error.message}`, 500);

  await writeAuditLog({ officialId: req.auth.officialId, action: 'update', entityType: 'agency_referral', entityId: referral.referral_id });

  return ok(res, { referralId: referral.referral_id, metadata: nextMetadata }, 'Relief details updated');
});

// Every task raised against this case, regardless of which role created it
// or which role it's assigned to - so a case's Tasks page shows the whole
// directive picture, not just this role's own. Scoped by loadOwnReferral
// (only reachable for a referral this role can already see), so this
// doesn't open up any new access - it's the same case-level visibility
// District Collector's cross-agency view already establishes as normal
// practice here, just for tasks instead of referrals.
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

// Hand-off to Rehabilitation Officer once immediate relief is settled - same
// mechanism as dlsa.routes.js's mark-trial-ready (a referral is scoped to
// one role, so this creates a NEW referral for Rehabilitation Officer and
// resolves this one). Rehabilitation is a post-case-closure phase
// (migration_029) - gated on the case actually being Closed, same rule the
// victim's own opt-in route enforces (user.routes.js's POST /rehabilitation-opt-in).
router.post('/referrals/:referralId/hand-off-rehabilitation', async (req, res) => {
  const referral = await loadOwnReferral(req.params.referralId, res);
  if (!referral) return;
  if (referral.status === 'Resolved') return fail(res, 'This referral is already resolved', 400);

  const { rows: caseRows } = await pool.query('select case_stage from users where user_id = $1', [referral.user_id]);
  if (!caseRows[0] || caseRows[0].case_stage !== 'Case Closed') {
    return fail(res, 'Rehabilitation hand-off is only available once the case is closed.', 400);
  }

  const { data: rehabReferral, error: insertError } = await supabase
    .from('agency_referrals')
    .insert({
      user_id: referral.user_id,
      referred_to_role: 'Rehabilitation Officer',
      referred_by_official_id: req.auth.officialId,
      reason: `Long-term rehabilitation hand-off from DWO (referral ${referral.referral_id})`,
    })
    .select('referral_id')
    .single();
  if (insertError) return fail(res, `Could not hand off to rehabilitation: ${insertError.message}`, 500);

  const { error: resolveError } = await supabase
    .from('agency_referrals')
    .update({ status: 'Resolved', resolved_at: new Date().toISOString() })
    .eq('referral_id', referral.referral_id);
  if (resolveError) return fail(res, `Hand-off created but could not resolve original referral: ${resolveError.message}`, 500);

  await writeAuditLog({ officialId: req.auth.officialId, action: 'create', entityType: 'agency_referral', entityId: rehabReferral.referral_id });

  return ok(res, { newReferralId: rehabReferral.referral_id }, 'Handed off to Rehabilitation Officer', 201);
});

// ===== Structured tasks (migration_030_agency_tasks.sql) =====
// Real action items - a specific role, a specific action, a due date, a
// Pending/Completed status - instead of a free-text note only the reader
// happens to see. THE TEMPLATE for the other 6 role route files' identical
// 3 routes below. Any role can create a task targeting any role (not just
// its own referrals' role) - e.g. District Collector directing Protection
// Officer to act, or DWO flagging something for Rehabilitation Officer.
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
  // Rehabilitation Officer's mandate only begins after case closure (same
  // rule as hand-off-rehabilitation above and the victim's own opt-in
  // route) - a task raised before that would sit in the officer's queue
  // for a case they have no referral or case access to yet.
  if (assignedToRole === 'Rehabilitation Officer' && userRows[0].case_stage !== 'Case Closed') {
    return fail(res, "Rehabilitation Officer's role begins only once the case is closed. Kindly assign this to a different office, or raise it again after closure.", 400);
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
