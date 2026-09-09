const express = require('express');
const { supabase } = require('../../core/db/supabaseClient');
const { pool } = require('../../core/db/pgPool');
const { writeAuditLog } = require('../../core/services/auditLog');
const { verifyToken } = require('../../core/middleware/verifyToken');
const { requireRole } = require('../../core/middleware/requireRole');
const { generalApiLimiter } = require('../../core/middleware/rateLimiter');
const { ok, fail } = require('../../core/services/responseEnvelope');
const { computeThreatTier, getSosEventCounts, getSosEventCount, THREAT_TIERS } = require('../../core/services/threatAssessment');
const { mountInterventionReviewRoutes } = require('../../core/services/interventionRequestReview');

const router = express.Router();

// Protection Officer - the consolidated Threat flow. Investigating Officer
// has since been REINSTATED (migration_033) as a real, separate role, and
// Accused Status authority moves back to IO's own investigation_records -
// this file now only READS accused_status (joined by user_id) to compute
// Threat Tier, it no longer sets it. Weekly safety-verification log stays
// as notes - the frontend surfaces the most recent note's createdAt as
// "last verified".
//
// Jurisdiction-scoped (migration_031's provider_id pattern, but reusing the
// jurisdiction_id column officials already have via official_roles, since
// "nearby officer" in the Threat flow means "assigned to the victim's own
// district" - no new column needed here).
const ROLE_NAME = 'Protection Officer';

function getOwnJurisdictionId(req) {
  return req.auth.roles.find((r) => r.roleName === ROLE_NAME)?.jurisdictionId || null;
}

// The 4 real ways a case reaches this queue, tagged at each creation site
// (user.routes.js's urgent-help/threat-report, io.routes.js's
// alert-protection-officer, interventionRequestReview.js's Accept branch) -
// drives both the priority sort in GET /referrals below and the origin
// badge the frontend renders. An older referral created before this field
// existed simply has no originType and sorts last, alongside any other
// unrecognized value - never errors, never blocks the query.
const ORIGIN_PRIORITY = { sos_emergency: 0, io_threat_alert: 1, intervention_accepted: 2, self_reported_threat: 3 };

// Fixed, auditable picklist for what "Mark Resolved" actually accomplished -
// deliberately not free text alone, so the victim's own Case Details can
// render a real explanation instead of a bare "Resolved" pill (see
// user.routes.js's GET /threat-status). Grounded in what a Protection
// Officer actually does under the Act: shelter, relocation, escort, medical
// coordination, or a determination that no further physical action was
// needed - 'Other' with the required detail text covers anything else.
const RESOLUTION_OUTCOME_CATEGORIES = [
  'Safe Shelter Coordinated',
  'Relocation Facilitated',
  'Police Escort Provided',
  'Medical Support Arranged',
  'Threat Neutralized - No Relocation Required',
  'Other',
];

router.use(verifyToken, requireRole([ROLE_NAME]), generalApiLimiter);

// Witness Protection and Relocation requests (Request Assistance, proof
// verified - FIR copy, police threat assessment) are the Protection
// Officer's own to review. Jurisdiction-scoped, matching this role's own
// existing scoped referral queue below - "nearby officer" reviews it too.
// discloseContactDetails: this role is dispatched to a person, not to a file
// - accepting a Relocation request means physically moving someone, which is
// impossible from a docket number alone. See the flag's own comment in
// interventionRequestReview.js, and loadOwnReferral below for the same
// boundary applied to the Protection Registry.
mountInterventionReviewRoutes(router, { roleName: ROLE_NAME, interventionTypeNames: ['Witness Protection', 'Relocation'], jurisdictionScoped: true, discloseContactDetails: true });

router.get('/referrals', async (req, res) => {
  const { status } = req.query;
  if (status && !['Open', 'Resolved'].includes(status)) return fail(res, "status must be 'Open' or 'Resolved'", 400);

  const jurisdictionId = getOwnJurisdictionId(req);
  if (!jurisdictionId) {
    return ok(res, { referrals: [], jurisdictionAssigned: false });
  }

  // Priority ordering, not just recency - an active emergency SOS must sit
  // above a routine self-reported threat regardless of which was created
  // first. Computed inline via a case expression, same "never store a
  // derived value" discipline the rest of this file's Threat Tier already
  // follows - ar.metadata->>'originType' is read fresh on every request,
  // never trusted as a cached rank. A row with a live location (any origin)
  // sorts ahead of one without, within the same origin tier.
  const { rows } = await pool.query(
    `select ar.referral_id, ar.user_id, ar.reason, ar.status, ar.metadata, ar.created_at, ar.resolved_at,
            u.docket_number, ct.name as case_type_name, ir.accused_status
     from agency_referrals ar
     join users u on u.user_id = ar.user_id
     join case_types ct on ct.case_type_id = u.case_type_id
     left join investigation_records ir on ir.user_id = ar.user_id
     where ar.referred_to_role = $1 and u.jurisdiction_id = $2 ${status ? 'and ar.status = $3' : ''}
     order by
       case ar.metadata->>'originType'
         when 'sos_emergency' then 0
         when 'io_threat_alert' then 1
         when 'intervention_accepted' then 2
         when 'self_reported_threat' then 3
         else 4
       end,
       (ar.metadata->'location' is null),
       ar.created_at desc`,
    status ? [ROLE_NAME, jurisdictionId, status] : [ROLE_NAME, jurisdictionId]
  );

  const userIds = rows.map((r) => r.user_id);
  const sosCounts = await getSosEventCounts(userIds, 7);

  return ok(res, {
    jurisdictionAssigned: true,
    referrals: rows.map((r) => {
      const accusedStatus = r.accused_status || null;
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
        threatTier: computeThreatTier({ accusedStatus, caseTypeName: r.case_type_name, sosEventCount7d: sosCounts[r.user_id] || 0 }),
        // Surfaced explicitly (not just left inside metadata) so the list
        // view can render an origin badge and a location indicator without
        // the frontend having to know metadata's internal shape.
        originType: r.metadata?.originType || null,
        location: r.metadata?.location || null,
        manualThreatTier: r.metadata?.manualThreatTier || null,
      };
    }),
  });
});

async function loadOwnReferral(referralId, res, req) {
  const jurisdictionId = getOwnJurisdictionId(req);
  if (!jurisdictionId) {
    fail(res, 'No jurisdiction is assigned to your account yet. Kindly contact Ministry.', 403);
    return null;
  }

  // Protection Officer is the ONE officials-side role that gets the
  // victim's name, phone and address - and only on this single-case detail
  // view, never in the list. Every other role in this system (IO included)
  // works from a docket number alone, and that is right for them: they read
  // a case file. This role is different in kind - it is physically
  // dispatched to find and protect a person, often on an emergency SOS. An
  // officer sent to an address they cannot see, for someone whose name they
  // do not know, with no number to call back if the GPS fix is stale or was
  // never granted, cannot actually do the job. The privacy boundary is kept
  // where it still holds: identity is scoped to the one case being opened,
  // is not in the queue listing, and every read is audit-logged below.
  const { rows } = await pool.query(
    `select ar.referral_id, ar.user_id, ar.reason, ar.status, ar.metadata, ar.created_at, ar.resolved_at,
            u.docket_number, ct.name as case_type_name, ir.accused_status,
            ui.full_name, ui.contact_number, ui.address
     from agency_referrals ar
     join users u on u.user_id = ar.user_id
     join case_types ct on ct.case_type_id = u.case_type_id
     left join investigation_records ir on ir.user_id = ar.user_id
     left join user_identity ui on ui.user_id = coalesce(u.linked_to_user_id, u.user_id)
     where ar.referral_id = $1 and ar.referred_to_role = $2 and u.jurisdiction_id = $3`,
    [referralId, ROLE_NAME, jurisdictionId]
  );
  if (!rows[0]) {
    fail(res, 'Referral not found', 404);
    return null;
  }
  return rows[0];
}

router.get('/referrals/:referralId', async (req, res) => {
  const referral = await loadOwnReferral(req.params.referralId, res, req);
  if (!referral) return;

  const { rows: notes } = await pool.query(
    `select n.note_id, n.note_text, n.created_at, o.full_name as author_name
     from agency_referral_notes n
     join officials o on o.official_id = n.author_official_id
     where n.referral_id = $1
     order by n.created_at asc`,
    [referral.referral_id]
  );

  const accusedStatus = referral.accused_status || null;
  const sosEventCount7d = await getSosEventCount(referral.user_id, 7);

  // Inbound directives for THIS case from a concerned office (typically
  // District Collector, the only role with statutory authority to direct
  // Protection Officer - see requireRole(['Protection Officer']) above,
  // this role can no longer raise its own outbound tasks). Surfaced inline
  // here rather than on a standalone "My Tasks" page, which was removed -
  // a directive about a case is meaningless divorced from that case's own
  // context, and this is exactly what agency_tasks.user_id already lets us
  // join on.
  const { rows: pendingDirectives } = await pool.query(
    `select t.task_id, t.action, t.due_at, t.created_at, o.full_name as created_by_name
     from agency_tasks t
     left join officials o on o.official_id = t.created_by_official_id
     where t.user_id = $1 and t.assigned_to_role = $2 and t.status = 'Pending'
     order by (t.due_at is null), t.due_at asc, t.created_at desc`,
    [referral.user_id, ROLE_NAME]
  );

  // Reading a victim's identity is a real, attributable act - logged the
  // same way every other sensitive read in this system is.
  await writeAuditLog({ officialId: req.auth.officialId, userId: referral.user_id, action: 'read', entityType: 'victim_contact_details', entityId: referral.referral_id });

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
    location: referral.metadata?.location || null,
    // Dispatch details - see loadOwnReferral's own comment on why this one
    // role gets them. null on a case whose identity row is missing.
    victimName: referral.full_name || null,
    victimContactNumber: referral.contact_number || null,
    victimAddress: referral.address || null,
    originType: referral.metadata?.originType || null,
    outcome: referral.metadata?.outcome || null,
    lastVerifiedAt: notes.length ? notes[notes.length - 1].created_at : null,
    notes: notes.map((n) => ({ noteId: n.note_id, noteText: n.note_text, createdAt: n.created_at, authorName: n.author_name })),
    // Read-only here - set by the Investigating Officer (migration_033),
    // reinstated as the role with real statutory custody over these facts.
    // Threat Tier is still computed fresh from this + real sos_events
    // history on every read, same discipline as before.
    accusedStatus,
    threatTier: computeThreatTier({ accusedStatus, caseTypeName: referral.case_type_name, sosEventCount7d }),
    // A Protection Officer's own manual assessment, additive to (never
    // replacing) the computed threatTier above - see PATCH
    // /referrals/:referralId/threat-tier. Both are always shown together in
    // the UI so the underlying IO/SOS signal never becomes invisible just
    // because an officer has overridden it.
    manualThreatTier: referral.metadata?.manualThreatTier || null,
    manualThreatTierSetAt: referral.metadata?.manualThreatTierSetAt || null,
    manualThreatTierSetBy: referral.metadata?.manualThreatTierSetBy || null,
    pendingDirectives: pendingDirectives.map((t) => ({
      taskId: t.task_id,
      action: t.action,
      dueAt: t.due_at,
      createdAt: t.created_at,
      createdByName: t.created_by_name || 'System',
    })),
  });
});

router.post('/referrals/:referralId/notes', async (req, res) => {
  const referral = await loadOwnReferral(req.params.referralId, res, req);
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

// Requires a structured outcome category (plus optional free-text detail)
// instead of just flipping status - this is the one change that actually
// closes the loop back to the victim: GET /threat-status (user.routes.js)
// surfaces this outcome on the victim's own Case Details, so "Resolved"
// alone is never the last thing they see. 'Other' still requires a detail
// string, so an outcome is never left completely unexplained.
router.patch('/referrals/:referralId/resolve', async (req, res) => {
  const referral = await loadOwnReferral(req.params.referralId, res, req);
  if (!referral) return;
  if (referral.status === 'Resolved') return fail(res, 'This referral is already resolved', 400);

  const { outcomeCategory, outcomeDetail } = req.body;
  if (!outcomeCategory || !RESOLUTION_OUTCOME_CATEGORIES.includes(outcomeCategory)) {
    return fail(res, `outcomeCategory is required and must be one of: ${RESOLUTION_OUTCOME_CATEGORIES.join(', ')}`, 400);
  }
  if (outcomeCategory === 'Other' && !(outcomeDetail && String(outcomeDetail).trim())) {
    return fail(res, 'outcomeDetail is required when outcomeCategory is "Other"', 400);
  }

  const resolvedAt = new Date().toISOString();
  const nextMetadata = {
    ...referral.metadata,
    outcome: { category: outcomeCategory, detail: outcomeDetail ? String(outcomeDetail).trim() : null, resolvedAt },
  };

  const { error } = await supabase
    .from('agency_referrals')
    .update({ status: 'Resolved', resolved_at: resolvedAt, metadata: nextMetadata })
    .eq('referral_id', referral.referral_id);
  if (error) return fail(res, `Could not resolve referral: ${error.message}`, 500);

  await writeAuditLog({ officialId: req.auth.officialId, action: 'update', entityType: 'agency_referral', entityId: referral.referral_id });

  return ok(res, { referralId: referral.referral_id, status: 'Resolved', outcome: nextMetadata.outcome }, 'Referral resolved');
});

// A Protection Officer's own manual Threat Tier assessment - additive to
// the computed value from threatAssessment.js's computeThreatTier, never
// replacing it (both are always returned together, see GET
// /referrals/:referralId above). Grounded in the same real-world judgment
// call a PO/DSP genuinely makes: they may know something the system's
// custody-status + SOS-count formula can't see (e.g. a credible verbal
// threat with no SOS event yet). Reuses the exact same 4-tier vocabulary as
// the computed value - deliberately not a 5th "Critical" tier, which would
// just fork the vocabulary between system and officer for no real gain.
// null clears the override, falling back to the computed tier alone.
router.patch('/referrals/:referralId/threat-tier', async (req, res) => {
  const referral = await loadOwnReferral(req.params.referralId, res, req);
  if (!referral) return;

  const { manualTier } = req.body;
  if (manualTier !== null && !THREAT_TIERS.includes(manualTier)) {
    return fail(res, `manualTier must be null or one of: ${THREAT_TIERS.join(', ')}`, 400);
  }

  const nextMetadata = { ...referral.metadata };
  if (manualTier === null) {
    delete nextMetadata.manualThreatTier;
    delete nextMetadata.manualThreatTierSetAt;
    delete nextMetadata.manualThreatTierSetBy;
  } else {
    nextMetadata.manualThreatTier = manualTier;
    nextMetadata.manualThreatTierSetAt = new Date().toISOString();
    nextMetadata.manualThreatTierSetBy = req.auth.officialId;
  }

  const { error } = await supabase.from('agency_referrals').update({ metadata: nextMetadata }).eq('referral_id', referral.referral_id);
  if (error) return fail(res, `Could not update Threat Tier: ${error.message}`, 500);

  // A note documenting the change, not a silent metadata flip - this is a
  // human exercising judgment that should be visible in the same log the
  // weekly safety verifications already live in.
  const previous = referral.metadata?.manualThreatTier || 'none (system-assessed only)';
  await supabase.from('agency_referral_notes').insert({
    referral_id: referral.referral_id,
    author_official_id: req.auth.officialId,
    note_text: manualTier
      ? `Officer-assessed Threat Tier set to "${manualTier}" (previously: ${previous}).`
      : `Officer-assessed Threat Tier override cleared - reverted to system assessment only.`,
  });

  await writeAuditLog({ officialId: req.auth.officialId, action: 'update', entityType: 'agency_referral', entityId: referral.referral_id });

  return ok(res, { referralId: referral.referral_id, manualThreatTier: manualTier }, 'Threat Tier updated');
});

// ===== Structured tasks (migration_030_agency_tasks.sql) - INBOUND ONLY =====
// Protection Officer has no statutory authority to raise cross-departmental
// directives - only District Collector does (per explicit design decision).
// GET /tasks and POST /tasks (the outbound "Assign Action Item"
// capability, and the standalone "My Tasks" list they backed) have been
// removed entirely from this role. A Pending directive FOR this role is
// still surfaced - inline on the specific case's own Referral Detail (see
// GET /referrals/:referralId's pendingDirectives above), not as a separate
// portal-wide list - and can still be marked complete here. Other roles'
// own routes.js files (dwo, districtAdmin, district_collector, etc.)
// keep their own POST /tasks, which can still target 'Protection Officer'
// as assignedToRole - this cut is one-directional.
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
