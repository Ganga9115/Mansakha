const express = require('express');
const { supabase } = require('../../core/db/supabaseClient');
const { pool } = require('../../core/db/pgPool');
const { writeAuditLog } = require('../../core/services/auditLog');
const { verifyToken } = require('../../core/middleware/verifyToken');
const { requireRole } = require('../../core/middleware/requireRole');
const { generalApiLimiter } = require('../../core/middleware/rateLimiter');
const { ok, fail } = require('../../core/services/responseEnvelope');
const { ACCUSED_STATUSES, computeThreatTier, getSosEventCounts, getSosEventCount } = require('../../core/services/threatAssessment');

const router = express.Router();

// Investigating Officer - REINSTATED (migration_033) with real substance,
// after briefly being retired and absorbed into Protection Officer under
// the earlier Legal Aid/Threat consolidation. This is now the one role
// with genuine statutory custody over arrest/bail/chargesheet facts,
// scoped to a real police station (the one that registered the FIR), not
// just a district.
//
// Deliberately NOT agency_referrals-based like every other new-role file -
// "every registered case gets investigated" (not a District-Admin-created
// escalation), so this mirrors Counsellor's own assigned_counsellor_id
// pattern instead: a case belongs to this queue because users.station_id
// matches this officer's own assigned station, the same way a case belongs
// to a Counsellor's queue via assigned_counsellor_id.
const ROLE_NAME = 'Investigating Officer';

function getOwnStationId(req) {
  return req.auth.roles.find((r) => r.roleName === ROLE_NAME)?.stationId || null;
}

router.use(verifyToken, requireRole([ROLE_NAME]), generalApiLimiter);

// 'Active' = still under investigation (case_stage hasn't advanced past it
// yet) - 'Handed Off' = chargesheet already filed and the case has moved to
// Trial or beyond, kept visible read-only rather than disappearing from
// view entirely.
router.get('/cases', async (req, res) => {
  const { status } = req.query;
  if (status && !['Active', 'HandedOff'].includes(status)) return fail(res, "status must be 'Active' or 'HandedOff'", 400);

  const stationId = getOwnStationId(req);
  if (!stationId) return ok(res, { cases: [], stationAssigned: false });

  const stageFilter = status === 'Active' ? `and u.case_stage = 'Investigation'` : status === 'HandedOff' ? `and u.case_stage != 'Investigation'` : '';

  const { rows } = await pool.query(
    `select u.user_id, u.docket_number, u.case_stage, ct.name as case_type_name,
            ir.accused_status, ir.investigation_progress, ir.chargesheet_status, ir.threat_alerted_at, ir.investigation_complete_at
     from users u
     join case_types ct on ct.case_type_id = u.case_type_id
     left join investigation_records ir on ir.user_id = u.user_id
     where u.station_id = $1 ${stageFilter}
     order by u.case_stage, u.docket_number`,
    [stationId]
  );

  const sosCounts = await getSosEventCounts(rows.map((r) => r.user_id), 7);

  return ok(res, {
    stationAssigned: true,
    cases: rows.map((r) => ({
      userId: r.user_id,
      docketNumber: r.docket_number,
      caseTypeName: r.case_type_name,
      caseStage: r.case_stage,
      accusedStatus: r.accused_status || null,
      investigationProgress: r.investigation_progress || null,
      chargesheetStatus: r.chargesheet_status || 'Not Filed',
      threatAlertedAt: r.threat_alerted_at || null,
      investigationCompleteAt: r.investigation_complete_at || null,
      threatTier: computeThreatTier({
        accusedStatus: r.accused_status || null,
        caseTypeName: r.case_type_name,
        sosEventCount7d: sosCounts[r.user_id] || 0,
      }),
    })),
  });
});

async function loadOwnCase(userId, req, res) {
  const stationId = getOwnStationId(req);
  if (!stationId) {
    fail(res, 'You are not yet assigned to a police station.', 403);
    return null;
  }
  const { rows } = await pool.query(
    `select u.user_id, u.docket_number, u.case_stage, u.station_id, ct.name as case_type_name,
            ir.investigation_id, ir.accused_status, ir.investigation_progress, ir.chargesheet_status,
            ir.chargesheet_filed_at, ir.threat_alerted_at, ir.investigation_complete_at
     from users u
     join case_types ct on ct.case_type_id = u.case_type_id
     left join investigation_records ir on ir.user_id = u.user_id
     where u.user_id = $1`,
    [userId]
  );
  const row = rows[0];
  if (!row || row.station_id !== stationId) {
    fail(res, 'Case not found', 404);
    return null;
  }
  return row;
}

router.get('/cases/:userId', async (req, res) => {
  const c = await loadOwnCase(req.params.userId, req, res);
  if (!c) return;

  const { rows: notes } = await pool.query(
    `select note_id, note_text, authored_by, created_at from case_notes
     where user_id = $1 and official_id = $2
     order by created_at desc`,
    [c.user_id, req.auth.officialId]
  );

  const sosEventCount7d = await getSosEventCount(c.user_id, 7);

  return ok(res, {
    userId: c.user_id,
    docketNumber: c.docket_number,
    caseTypeName: c.case_type_name,
    caseStage: c.case_stage,
    accusedStatus: c.accused_status || null,
    investigationProgress: c.investigation_progress || null,
    chargesheetStatus: c.chargesheet_status || 'Not Filed',
    chargesheetFiledAt: c.chargesheet_filed_at || null,
    threatAlertedAt: c.threat_alerted_at || null,
    investigationCompleteAt: c.investigation_complete_at || null,
    sosEventCount7d,
    threatTier: computeThreatTier({ accusedStatus: c.accused_status || null, caseTypeName: c.case_type_name, sosEventCount7d }),
    notes: notes.map((n) => ({ noteId: n.note_id, noteText: n.note_text, authoredBy: n.authored_by, createdAt: n.created_at })),
  });
});

// One investigation_records row per case (unique on user_id) - upserted
// rather than assumed to already exist, since a case newly assigned to this
// station has none yet.
async function upsertInvestigationRecord(userId, officialId, patch) {
  const { data, error } = await supabase
    .from('investigation_records')
    .upsert(
      { user_id: userId, updated_by: officialId, updated_at: new Date().toISOString(), ...patch },
      { onConflict: 'user_id' }
    )
    .select('investigation_id')
    .single();
  return { data, error };
}

// Sets Accused Status - the real signal Threat Tier is computed from on
// every subsequent read (core/services/threatAssessment.js). Not stored as
// a tier itself - the tier also depends on sos_events, which changes
// independently, so it's always computed fresh.
router.patch('/cases/:userId/accused-status', async (req, res) => {
  const c = await loadOwnCase(req.params.userId, req, res);
  if (!c) return;

  const { accusedStatus } = req.body;
  if (!ACCUSED_STATUSES.includes(accusedStatus)) {
    return fail(res, `accusedStatus must be one of: ${ACCUSED_STATUSES.join(', ')}`, 400);
  }

  const { error } = await upsertInvestigationRecord(c.user_id, req.auth.officialId, { accused_status: accusedStatus });
  if (error) return fail(res, `Could not update accused status: ${error.message}`, 500);

  await writeAuditLog({ officialId: req.auth.officialId, userId: c.user_id, action: 'update', entityType: 'investigation_record', entityId: c.user_id });

  return ok(res, { userId: c.user_id, accusedStatus }, 'Accused status updated');
});

// Victim-safe progress summary - shown on the victim's own Case Details
// (no confidential evidence; raw investigative detail stays in this
// officer's own case_notes, never surfaced to the victim).
router.patch('/cases/:userId/investigation-progress', async (req, res) => {
  const c = await loadOwnCase(req.params.userId, req, res);
  if (!c) return;

  const { investigationProgress } = req.body;
  if (!investigationProgress || !String(investigationProgress).trim()) return fail(res, 'investigationProgress is required', 400);

  const { error } = await upsertInvestigationRecord(c.user_id, req.auth.officialId, { investigation_progress: String(investigationProgress).trim() });
  if (error) return fail(res, `Could not update investigation progress: ${error.message}`, 500);

  await writeAuditLog({ officialId: req.auth.officialId, userId: c.user_id, action: 'update', entityType: 'investigation_record', entityId: c.user_id });

  return ok(res, { userId: c.user_id }, 'Investigation progress updated');
});

// migration_034: no longer touches users.case_stage - case_stage is now
// EXCLUSIVELY eCourt-authoritative (core/services/ecourtStageSync.js is the
// only writer anywhere in the backend). This still records IO's own real
// chargesheet_status/chargesheet_filed_at fact on investigation_records
// (genuinely IO's to know and log), it just no longer advances the shared
// case stage as a side effect - that transition now happens on its own
// simulated eCourt schedule, independent of when IO happens to log this.
// Idempotent - filing again once already Filed is a no-op error, not a
// duplicate write.
router.patch('/cases/:userId/chargesheet', async (req, res) => {
  const c = await loadOwnCase(req.params.userId, req, res);
  if (!c) return;
  if (c.chargesheet_status === 'Filed') return fail(res, 'Chargesheet has already been marked as filed for this case.', 400);

  const filedAt = new Date().toISOString();
  const { error } = await upsertInvestigationRecord(c.user_id, req.auth.officialId, { chargesheet_status: 'Filed', chargesheet_filed_at: filedAt });
  if (error) return fail(res, `Could not update chargesheet status: ${error.message}`, 500);

  await writeAuditLog({ officialId: req.auth.officialId, userId: c.user_id, action: 'update', entityType: 'investigation_record', entityId: c.user_id });

  return ok(res, { userId: c.user_id, chargesheetStatus: 'Filed' }, 'Chargesheet marked as filed');
});

// A bookkeeping close-out distinct from the chargesheet/case_stage
// transition above - lets this officer explicitly declare their own
// involvement complete (used to filter the Active/Handed Off tabs),
// without implying the case itself is closed (that stays Data Operator's
// sole action, unrelated to this).
router.patch('/cases/:userId/investigation-complete', async (req, res) => {
  const c = await loadOwnCase(req.params.userId, req, res);
  if (!c) return;
  if (c.investigation_complete_at) return fail(res, 'Investigation has already been marked complete for this case.', 400);

  const { error } = await upsertInvestigationRecord(c.user_id, req.auth.officialId, { investigation_complete_at: new Date().toISOString() });
  if (error) return fail(res, `Could not mark investigation complete: ${error.message}`, 500);

  await writeAuditLog({ officialId: req.auth.officialId, userId: c.user_id, action: 'update', entityType: 'investigation_record', entityId: c.user_id });

  return ok(res, { userId: c.user_id }, 'Investigation marked complete');
});

// "Threat detected -> Protection Officer alerted (jurisdiction-scoped)" -
// creates a real, actionable referral for the jurisdiction's Protection
// Officer (same self-referral-style creation used by urgent-help's own PO
// alert), not just a passive notification. Reuses an existing OPEN
// referral if one already exists rather than creating a duplicate.
router.post('/cases/:userId/alert-protection-officer', async (req, res) => {
  const c = await loadOwnCase(req.params.userId, req, res);
  if (!c) return;

  const { reason } = req.body;
  if (!reason || !String(reason).trim()) return fail(res, 'reason is required - kindly describe the detected threat', 400);

  const { rows: existingReferralRows } = await pool.query(
    `select referral_id, metadata from agency_referrals where user_id = $1 and referred_to_role = 'Protection Officer' and status = 'Open' limit 1`,
    [c.user_id]
  );
  const existingReferral = existingReferralRows[0];

  if (existingReferral) {
    await supabase.from('agency_referral_notes').insert({
      referral_id: existingReferral.referral_id,
      author_official_id: req.auth.officialId,
      note_text: `Investigating Officer: ${String(reason).trim()}`,
    });
  } else {
    const { error: insertError } = await supabase.from('agency_referrals').insert({
      user_id: c.user_id,
      referred_to_role: 'Protection Officer',
      referred_by_official_id: req.auth.officialId,
      reason: String(reason).trim(),
      // originType drives the Protection Registry's priority sort - see
      // protectionOfficer.routes.js's GET /referrals.
      metadata: { originType: 'io_threat_alert' },
    });
    if (insertError) return fail(res, `Could not alert Protection Officer: ${insertError.message}`, 500);
  }

  const { error: updateError } = await upsertInvestigationRecord(c.user_id, req.auth.officialId, { threat_alerted_at: new Date().toISOString() });
  if (updateError) return fail(res, `Alert sent but could not update the investigation record: ${updateError.message}`, 500);

  await writeAuditLog({ officialId: req.auth.officialId, userId: c.user_id, action: 'create', entityType: 'agency_referral', entityId: c.user_id });

  return ok(res, { userId: c.user_id }, 'Protection Officer alerted', 201);
});

// Every task raised on this case so far, across ANY role - not referral-
// scoped like every other new-role file (IO has no referral concept), just
// a direct t.user_id filter. Same case-level visibility principle District
// Collector's cross-agency view already establishes as normal practice.
router.get('/cases/:userId/tasks', async (req, res) => {
  const c = await loadOwnCase(req.params.userId, req, res);
  if (!c) return;

  const { rows } = await pool.query(
    `select t.task_id, t.assigned_to_role, t.action, t.due_at, t.status, t.completed_at,
            t.auto_generated, t.created_at, o.full_name as created_by_name
     from agency_tasks t
     left join officials o on o.official_id = t.created_by_official_id
     where t.user_id = $1
     order by (t.due_at is null), t.due_at asc, t.created_at desc`,
    [c.user_id]
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

router.post('/cases/:userId/notes', async (req, res) => {
  const c = await loadOwnCase(req.params.userId, req, res);
  if (!c) return;

  const { noteText } = req.body;
  if (!noteText || !String(noteText).trim()) return fail(res, 'noteText is required', 400);

  const { data, error } = await supabase
    .from('case_notes')
    .insert({ user_id: c.user_id, official_id: req.auth.officialId, note_text: String(noteText).trim(), authored_by: 'manual' })
    .select('note_id')
    .single();
  if (error) return fail(res, `Could not add note: ${error.message}`, 500);

  await writeAuditLog({ officialId: req.auth.officialId, userId: c.user_id, action: 'create', entityType: 'case_note', entityId: data.note_id });

  return ok(res, { noteId: data.note_id }, 'Note added', 201);
});

// ===== Structured tasks (migration_030_agency_tasks.sql) =====
// Same template every other new-role file uses.
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
      // IO's own case pages live at /io/cases/:userId, not /io/referrals/:id -
      // a task whose source referral belongs to another role (e.g. Protection
      // Officer) is never something this portal can open directly, matching
      // every other role file's same sourceReferralRole check.
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
