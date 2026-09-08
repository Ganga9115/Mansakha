const express = require('express');
const { supabase } = require('../../core/db/supabaseClient');
const { pool } = require('../../core/db/pgPool');
const { writeAuditLog } = require('../../core/services/auditLog');
const { verifyToken } = require('../../core/middleware/verifyToken');
const { requireRole } = require('../../core/middleware/requireRole');
const { generalApiLimiter } = require('../../core/middleware/rateLimiter');
const { ok, fail } = require('../../core/services/responseEnvelope');
const {
  getCompensationSchedule,
  buildCompensationStages,
  isCompensationStageUnlocked,
  withLiveCompensationView,
} = require('../../core/services/compensationSchedule');
const { mountInterventionReviewRoutes } = require('../../core/services/interventionRequestReview');

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

// Two independent tracks on the same referral, matching DWO's real
// statutory function - immediate relief (urgent financial/essential
// support, settled fast) and compensation (the larger statutory PoA Act
// award, paid out in stages tied to the case's own real progress). Both
// computed fresh on every read from stored facts, same discipline as
// core/services/threatAssessment.js's Threat Tier - never a stale label.

// ===== Immediate Relief =====
const ASSISTANCE_TYPES = ['Financial', 'Essential Support'];
const IMMEDIATE_RELIEF_COMPLIANCE_DAYS = 7;

function computeImmediateReliefCompliance(metadata, createdAt) {
  const relief = metadata?.immediateRelief;
  if (relief && relief.status !== 'Requested') return 'On Track'; // already moving
  const daysOpen = Math.floor((Date.now() - new Date(createdAt).getTime()) / 86400000);
  return daysOpen > IMMEDIATE_RELIEF_COMPLIANCE_DAYS ? 'Overdue' : 'On Track';
}

router.use(verifyToken, requireRole([ROLE_NAME]), generalApiLimiter);

// Financial Assistance and Medical requests (Request Assistance, proof
// verified) are DWO's own to review - Financial Assistance is exactly the
// Immediate Relief track above; Medical fits DWO's existing "Essential
// Support" assistance type. Not jurisdiction-scoped, matching this role's
// own existing (unscoped) referral queue below.
mountInterventionReviewRoutes(router, { roleName: ROLE_NAME, interventionTypeNames: ['Financial Assistance', 'Medical'] });

router.get('/referrals', async (req, res) => {
  const { status } = req.query;
  if (status && !['Open', 'Resolved'].includes(status)) return fail(res, "status must be 'Open' or 'Resolved'", 400);

  const { rows } = await pool.query(
    `select ar.referral_id, ar.user_id, ar.reason, ar.status, ar.metadata, ar.created_at, ar.resolved_at,
            u.docket_number, u.case_stage, ct.name as case_type_name
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
      immediateRelief: r.metadata?.immediateRelief || null,
      immediateReliefCompliance: computeImmediateReliefCompliance(r.metadata, r.created_at),
      compensation: withLiveCompensationView(r.metadata?.compensation, r.case_stage),
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
    immediateRelief: referral.metadata?.immediateRelief || null,
    immediateReliefCompliance: computeImmediateReliefCompliance(referral.metadata, referral.created_at),
    // Shown even before DWO has verified anything, so the detail page can
    // display "Suggested category & amount" as soon as a referral exists -
    // matches the flowchart's "auto-identifies applicable statutory
    // category" step, which happens independently of any DWO action.
    suggestedCompensation: getCompensationSchedule(referral.case_type_name),
    compensation: withLiveCompensationView(referral.metadata?.compensation, referral.case_stage),
    // Rehabilitation Officer's mandate only begins after case closure (see
    // hand-off-rehabilitation below) - exposed so the Assign Task form can
    // hide that option as a target until then, rather than offering a
    // directive the officer has no case access to yet.
    rehabilitationEligible: referral.case_stage === 'Case Closed',
  });
});

// ===== Immediate Relief (financial + essential support) =====
// The urgent, fast-turnaround track - "victim requires financial aid ->
// DWO notification -> Financial assistance / Essential Support -> Relief
// approved -> Relief provided -> victim notified -> victim confirms ->
// resolved". Kept entirely separate from the Compensation Module below,
// which is the larger statutory award paid out over the life of the case.
router.patch('/referrals/:referralId/immediate-relief/approve', async (req, res) => {
  const referral = await loadOwnReferral(req.params.referralId, res);
  if (!referral) return;

  const existing = referral.metadata?.immediateRelief;
  if (existing && ['Provided', 'Confirmed'].includes(existing.status)) {
    return fail(res, 'Immediate relief has already been provided and can no longer be modified.', 400);
  }

  const { assistanceTypes, financialAmount, essentialSupportNotes } = req.body;
  if (!Array.isArray(assistanceTypes) || assistanceTypes.length === 0) {
    return fail(res, `assistanceTypes must include at least one of: ${ASSISTANCE_TYPES.join(', ')}`, 400);
  }
  if (!assistanceTypes.every((t) => ASSISTANCE_TYPES.includes(t))) {
    return fail(res, `assistanceTypes must be one of: ${ASSISTANCE_TYPES.join(', ')}`, 400);
  }
  if (assistanceTypes.includes('Financial') && (typeof financialAmount !== 'number' || financialAmount <= 0)) {
    return fail(res, 'financialAmount must be a positive number when Financial assistance is selected', 400);
  }
  if (assistanceTypes.includes('Essential Support') && (!essentialSupportNotes || !String(essentialSupportNotes).trim())) {
    return fail(res, 'essentialSupportNotes is required when Essential Support is selected', 400);
  }

  const nextMetadata = {
    ...referral.metadata,
    immediateRelief: {
      assistanceTypes,
      financialAmount: assistanceTypes.includes('Financial') ? financialAmount : null,
      essentialSupportNotes: assistanceTypes.includes('Essential Support') ? String(essentialSupportNotes).trim() : null,
      status: 'Approved',
      approvedAt: new Date().toISOString(),
      providedAt: null,
      confirmedAt: null,
    },
  };

  const { error } = await supabase
    .from('agency_referrals')
    .update({ metadata: nextMetadata })
    .eq('referral_id', referral.referral_id);
  if (error) return fail(res, `Could not approve relief: ${error.message}`, 500);

  await writeAuditLog({ officialId: req.auth.officialId, action: 'update', entityType: 'agency_referral', entityId: referral.referral_id });

  return ok(res, { referralId: referral.referral_id, immediateRelief: nextMetadata.immediateRelief }, 'Relief approved');
});

// DWO's confirmation that the approved relief has actually been handed
// over - a separate, later event from approval, so "approved on paper" and
// "physically provided" are never conflated into one timestamp.
router.patch('/referrals/:referralId/immediate-relief/mark-provided', async (req, res) => {
  const referral = await loadOwnReferral(req.params.referralId, res);
  if (!referral) return;

  const relief = referral.metadata?.immediateRelief;
  if (!relief || relief.status !== 'Approved') {
    return fail(res, 'Relief must be approved before it can be marked as provided.', 400);
  }

  const nextMetadata = {
    ...referral.metadata,
    immediateRelief: { ...relief, status: 'Provided', providedAt: new Date().toISOString() },
  };

  const { error } = await supabase
    .from('agency_referrals')
    .update({ metadata: nextMetadata })
    .eq('referral_id', referral.referral_id);
  if (error) return fail(res, `Could not update relief: ${error.message}`, 500);

  await writeAuditLog({ officialId: req.auth.officialId, action: 'update', entityType: 'agency_referral', entityId: referral.referral_id });

  return ok(res, { referralId: referral.referral_id, immediateRelief: nextMetadata.immediateRelief }, 'Relief marked as provided');
});

// ===== Compensation Module =====
// The larger statutory award, tracked in stages tied to the case's own
// real progress - "DWO verification -> creates compensation case & tracks
// it -> payment stages -> DWO monitors payment flow -> paid / pending ->
// DM escalation if still unresolved".
router.patch('/referrals/:referralId/compensation/verify', async (req, res) => {
  const referral = await loadOwnReferral(req.params.referralId, res);
  if (!referral) return;

  const existing = referral.metadata?.compensation;
  if (existing && existing.stages.some((s) => s.status === 'Paid')) {
    return fail(res, 'The verified amount cannot be changed once a payment stage has been marked as paid.', 400);
  }

  const suggested = getCompensationSchedule(referral.case_type_name);
  const { verifiedAmount } = req.body;
  const amount = verifiedAmount !== undefined ? verifiedAmount : suggested.suggestedAmount;
  if (typeof amount !== 'number' || amount <= 0) {
    return fail(res, 'verifiedAmount must be a positive number', 400);
  }

  const nextMetadata = {
    ...referral.metadata,
    compensation: {
      statutoryCategory: suggested.statutoryCategory,
      suggestedAmount: suggested.suggestedAmount,
      verifiedAmount: amount,
      verifiedAt: new Date().toISOString(),
      stages: buildCompensationStages(amount),
    },
  };

  const { error } = await supabase
    .from('agency_referrals')
    .update({ metadata: nextMetadata })
    .eq('referral_id', referral.referral_id);
  if (error) return fail(res, `Could not verify compensation: ${error.message}`, 500);

  await writeAuditLog({ officialId: req.auth.officialId, action: 'update', entityType: 'agency_referral', entityId: referral.referral_id });

  return ok(
    res,
    { referralId: referral.referral_id, compensation: withLiveCompensationView(nextMetadata.compensation, referral.case_stage) },
    'Compensation case verified and tracked'
  );
});

router.patch('/referrals/:referralId/compensation/stages/:stageIndex/mark-paid', async (req, res) => {
  const referral = await loadOwnReferral(req.params.referralId, res);
  if (!referral) return;

  const compensation = referral.metadata?.compensation;
  if (!compensation) return fail(res, 'Compensation has not been verified for this case yet.', 400);

  const idx = Number(req.params.stageIndex);
  const stage = compensation.stages[idx];
  if (!stage) return fail(res, 'Payment stage not found', 404);
  if (!isCompensationStageUnlocked(stage.unlocksAtCaseStage, referral.case_stage)) {
    return fail(res, `This stage unlocks once the case reaches "${stage.unlocksAtCaseStage}". The case has not reached that point yet.`, 400);
  }
  if (stage.status === 'Paid') return fail(res, 'This stage has already been marked as paid.', 400);

  const nextStages = compensation.stages.map((s, i) => (i === idx ? { ...s, status: 'Paid', paidAt: new Date().toISOString() } : s));
  const nextMetadata = { ...referral.metadata, compensation: { ...compensation, stages: nextStages } };

  const { error } = await supabase
    .from('agency_referrals')
    .update({ metadata: nextMetadata })
    .eq('referral_id', referral.referral_id);
  if (error) return fail(res, `Could not update payment stage: ${error.message}`, 500);

  await writeAuditLog({ officialId: req.auth.officialId, action: 'update', entityType: 'agency_referral', entityId: referral.referral_id });

  return ok(
    res,
    { referralId: referral.referral_id, compensation: withLiveCompensationView(nextMetadata.compensation, referral.case_stage) },
    'Payment stage marked as paid'
  );
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

  // migration_031 - a providerId is now required so the new referral is
  // visible to the officer actually assigned to that centre (see
  // rehabilitationOfficer.routes.js's provider-scoped queue). Without this,
  // a hand-off-created referral would carry no providerId and be invisible
  // to every officer, same gap the victim's own opt-in never had.
  const { providerId } = req.body;
  if (!providerId) return fail(res, 'providerId is required to hand off to Rehabilitation Officer', 400);

  const { rows: caseRows } = await pool.query('select case_stage from users where user_id = $1', [referral.user_id]);
  if (!caseRows[0] || caseRows[0].case_stage !== 'Case Closed') {
    return fail(res, 'Rehabilitation hand-off is only available once the case is closed.', 400);
  }

  const { rows: providerRows } = await pool.query(
    'select provider_id, name from rehabilitation_providers where provider_id = $1 and deleted_at is null',
    [providerId]
  );
  const provider = providerRows[0];
  if (!provider) return fail(res, 'Selected provider not found', 404);

  const { data: rehabReferral, error: insertError } = await supabase
    .from('agency_referrals')
    .insert({
      user_id: referral.user_id,
      referred_to_role: 'Rehabilitation Officer',
      referred_by_official_id: req.auth.officialId,
      reason: `Long-term rehabilitation hand-off from DWO (referral ${referral.referral_id}) to ${provider.name}.`,
      metadata: { providerId: provider.provider_id, providerName: provider.name },
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
'DLSA Coordinator', 'District Collector', 'Rehabilitation Officer',
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
