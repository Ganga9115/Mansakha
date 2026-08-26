const express = require('express');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { supabase } = require('../db/supabaseClient');
const { writeAuditLog } = require('../services/auditLog');
const { verifyToken } = require('../middleware/verifyToken');
const { requireRole } = require('../middleware/requireRole');
const { generalApiLimiter } = require('../middleware/rateLimiter');
const { ok, fail } = require('../services/responseEnvelope');
const { getDescendantJurisdictionIds } = require('../services/jurisdictionTree');

const router = express.Router();

router.use(verifyToken, requireRole(['Ministry']), generalApiLimiter);

const CREATABLE_ROLES = ['Administration', 'Counsellor', 'Data Intake Admin'];
const JURISDICTION_LIMITED_LEVELS = ['district', 'state']; // Feature Catalog Section 6.2: "Limit: 1 per District/State"

// Section 6.2's new validation - an Administration account at district or
// state level can't be created (or granted) where an active one already
// exists for that exact jurisdiction. National Administration and Counsellor
// have no stated limit; Data Intake Admin isn't jurisdiction-scoped at all.
async function checkJurisdictionLimit(roleName, jurisdictionId) {
  if (roleName !== 'Administration' || !jurisdictionId) return null;

  const { data: level } = await supabase.from('jurisdictions').select('level').eq('jurisdiction_id', jurisdictionId).maybeSingle();
  if (!level || !JURISDICTION_LIMITED_LEVELS.includes(level.level)) return null;

  const { data: existing } = await supabase
    .from('official_roles')
    .select('official_role_id, roles(role_name)')
    .eq('jurisdiction_id', jurisdictionId)
    .is('revoked_at', null);

  const alreadyHasAdmin = (existing || []).some((r) => r.roles.role_name === 'Administration');
  if (alreadyHasAdmin) return `This ${level.level} already has an active Administration account - revoke it first before assigning a new one`;
  return null;
}

// The Staff Management screen (Section 8) needs to list existing accounts before
// it can show anything to create/revoke - the create/revoke routes alone don't
// support that.
router.get('/staff', async (req, res) => {
  const { page = 1 } = req.query;
  const pageSize = 30;
  const offset = (Number(page) - 1) * pageSize;

  // official_roles has two FKs into officials (official_id and assigned_by) - the
  // explicit constraint-name hint disambiguates the embed (see the identical fix
  // in routes/admin.js's workload query, where the unhinted version silently
  // returned no rows).
  const { data, count, error } = await supabase
    .from('officials')
    .select(
      'official_id, full_name, email, phone, must_change_password, official_roles!official_roles_official_id_fkey(role_id, jurisdiction_id, revoked_at, roles(role_name), jurisdictions(name))',
      { count: 'exact' }
    )
    .order('full_name')
    .range(offset, offset + pageSize - 1);
  if (error) return fail(res, `Could not load staff list: ${error.message}`, 500);

  const staff = (data || []).map((o) => ({
    officialId: o.official_id,
    fullName: o.full_name,
    email: o.email,
    phone: o.phone,
    mustChangePassword: o.must_change_password,
    roles: (o.official_roles || [])
      .filter((r) => !r.revoked_at)
      .map((r) => ({ roleName: r.roles.role_name, jurisdictionName: r.jurisdictions ? r.jurisdictions.name : null })),
  }));

  return ok(res, { staff, total: count || staff.length });
});

// Extends Section 7's contract (explicitly allowed: "extend as needed, keep the
// shape consistent") with what Section 3/8 requires for Ministry to function at
// all: nothing else can onboard staff without this.
router.post('/staff', async (req, res) => {
  const { fullName, email, roleName, jurisdictionId, password, staffId } = req.body;
  if (!fullName || !email || !roleName || !password) return fail(res, 'fullName, email, roleName, and password are required', 400);

  // Server-side allowlist, not trusting client input: this endpoint can ONLY create
  // Administration/Counsellor/Data Intake Admin accounts. A Ministry account is
  // seeded/manually provisioned (Section 3) and must never be creatable through
  // an API call, even if a client sent roleName: "Ministry".
  if (!CREATABLE_ROLES.includes(roleName)) {
    return fail(res, `roleName must be one of: ${CREATABLE_ROLES.join(', ')}`, 400);
  }
  if (roleName === 'Administration' && !jurisdictionId) {
    return fail(res, 'jurisdictionId is required for Administration accounts', 400);
  }

  const limitError = await checkJurisdictionLimit(roleName, jurisdictionId);
  if (limitError) return fail(res, limitError, 409);

  const { data: roleRow } = await supabase.from('roles').select('role_id').eq('role_name', roleName).single();

  const passwordHash = await bcrypt.hash(password, 12);

  const { data: official, error: officialError } = await supabase
    .from('officials')
    // staffId: the login screen's "State Admin ID"/"Counsellor ID"/etc. field -
    // defaults to '1' (every account uses that placeholder for now, per explicit
    // request) when Ministry doesn't send one.
    .insert({ full_name: fullName, email, password_hash: passwordHash, must_change_password: true, staff_id: staffId || '1', provisioned_by: req.auth.officialId })
    .select('official_id')
    .single();
  if (officialError) return fail(res, `Could not create account: ${officialError.message}`, 500);

  await supabase.from('official_roles').insert({
    official_id: official.official_id,
    role_id: roleRow.role_id,
    jurisdiction_id: roleName === 'Administration' ? jurisdictionId : jurisdictionId || null,
    assigned_by: req.auth.officialId,
  });

  await writeAuditLog({ officialId: req.auth.officialId, action: 'create', entityType: 'official', entityId: official.official_id });

  // must_change_password forces them to replace it on first login.
  return ok(res, { officialId: official.official_id }, 'Account created', 201);
});

// Deliberately name/phone only - email is the login identifier, so it stays
// immutable here to avoid an edit accidentally locking an account out.
router.patch('/staff/:officialId', async (req, res) => {
  const { officialId } = req.params;
  const { fullName, phone } = req.body;
  if (!fullName && phone === undefined) return fail(res, 'fullName or phone is required', 400);

  const patch = {};
  if (fullName) patch.full_name = fullName;
  if (phone !== undefined) patch.phone = phone || null;

  const { error } = await supabase.from('officials').update(patch).eq('official_id', officialId);
  if (error) return fail(res, `Could not update account: ${error.message}`, 500);

  await writeAuditLog({ officialId: req.auth.officialId, action: 'update', entityType: 'official', entityId: officialId });

  return ok(res, null, 'Account updated');
});

// (Re)grants a role/jurisdiction to an existing official - e.g. after a
// revoke, or adding a second role to someone who already has one. Reuses the
// same allowlist/validation as account creation.
router.post('/staff/:officialId/roles', async (req, res) => {
  const { officialId } = req.params;
  const { roleName, jurisdictionId } = req.body;
  if (!roleName) return fail(res, 'roleName is required', 400);
  if (!CREATABLE_ROLES.includes(roleName)) return fail(res, `roleName must be one of: ${CREATABLE_ROLES.join(', ')}`, 400);
  if (roleName === 'Administration' && !jurisdictionId) return fail(res, 'jurisdictionId is required for Administration accounts', 400);

  const limitError = await checkJurisdictionLimit(roleName, jurisdictionId);
  if (limitError) return fail(res, limitError, 409);

  const { data: official } = await supabase.from('officials').select('official_id').eq('official_id', officialId).maybeSingle();
  if (!official) return fail(res, 'Account not found', 404);

  const { data: roleRow } = await supabase.from('roles').select('role_id').eq('role_name', roleName).single();

  const { data, error } = await supabase
    .from('official_roles')
    .insert({ official_id: officialId, role_id: roleRow.role_id, jurisdiction_id: jurisdictionId || null, assigned_by: req.auth.officialId })
    .select('official_role_id')
    .single();
  if (error) return fail(res, `Could not assign role: ${error.message}`, 500);

  await writeAuditLog({ officialId: req.auth.officialId, action: 'create', entityType: 'official_role', entityId: data.official_role_id });

  return ok(res, { officialRoleId: data.official_role_id }, 'Role assigned', 201);
});

// Not a hard delete: `officials` has live FK references (interventions,
// audit_log, official_roles.assigned_by) that a DELETE would break. This
// revokes every active role the account holds - combined with verifyToken's
// per-request DB recheck, a zero-role account is already fully locked out,
// which is what "delete/deactivate" actually needs to mean here.
router.patch('/staff/:officialId/revoke', async (req, res) => {
  const { officialId } = req.params;

  const { error } = await supabase
    .from('official_roles')
    .update({ revoked_at: new Date().toISOString() })
    .eq('official_id', officialId)
    .is('revoked_at', null);
  if (error) return fail(res, 'Could not revoke account', 500);

  await writeAuditLog({ officialId: req.auth.officialId, action: 'revoke', entityType: 'official', entityId: officialId });

  return ok(res, null, 'Account access revoked');
});

router.get('/audit-log', async (req, res) => {
  const { page = 1 } = req.query;
  const pageSize = 50;
  const offset = (Number(page) - 1) * pageSize;

  const { data, count, error } = await supabase
    .from('audit_log')
    .select('log_id, official_id, victim_id, action, entity_type, entity_id, occurred_at', { count: 'exact' })
    .order('occurred_at', { ascending: false })
    .range(offset, offset + pageSize - 1);
  if (error) return fail(res, 'Could not load audit log', 500);

  return ok(res, { entries: data || [], total: count || 0 });
});

router.get('/languages', async (req, res) => {
  const { data, error } = await supabase.from('languages').select('language_id, code, name').is('deleted_at', null).order('name');
  if (error) return fail(res, 'Could not load languages', 500);
  return ok(res, { languages: data || [] });
});

router.post('/languages', async (req, res) => {
  const { code, name } = req.body;
  if (!code || !name) return fail(res, 'code and name are required', 400);

  const { data, error } = await supabase.from('languages').insert({ code, name }).select('language_id').single();
  if (error) return fail(res, `Could not add language: ${error.message}`, 500);

  await writeAuditLog({ officialId: req.auth.officialId, action: 'create', entityType: 'language', entityId: data.language_id });

  return ok(res, { languageId: data.language_id }, 'Language added', 201);
});

router.patch('/languages/:languageId', async (req, res) => {
  const { languageId } = req.params;
  const { code, name } = req.body;
  if (!code && !name) return fail(res, 'code or name is required', 400);

  const patch = {};
  if (code) patch.code = code;
  if (name) patch.name = name;

  const { error } = await supabase.from('languages').update(patch).eq('language_id', languageId);
  if (error) return fail(res, `Could not update language: ${error.message}`, 500);

  await writeAuditLog({ officialId: req.auth.officialId, action: 'update', entityType: 'language', entityId: languageId });

  return ok(res, null, 'Language updated');
});

// Soft-delete - victims.preferred_language FKs into this table, so a
// language a victim already picked must keep resolving even after it's
// removed from the selectable list.
router.delete('/languages/:languageId', async (req, res) => {
  const { languageId } = req.params;

  const { error } = await supabase.from('languages').update({ deleted_at: new Date().toISOString() }).eq('language_id', languageId);
  if (error) return fail(res, `Could not remove language: ${error.message}`, 500);

  await writeAuditLog({ officialId: req.auth.officialId, action: 'delete', entityType: 'language', entityId: languageId });

  return ok(res, null, 'Language removed');
});

// ===== Feature Catalog Section 6.4 - "Manage case types" / "Manage
// intervention types" / "Manage channels", the same GET/POST/PATCH/DELETE
// soft-delete pattern as languages above (each written out explicitly,
// matching this codebase's existing style rather than a generic CRUD
// factory - languages itself is written the same longhand way). victims.
// case_type_id / distress_scores.suggested_intervention_type_id /
// interactions.channel_id all FK into these, so removal is soft-delete only,
// same reasoning as languages. =====

router.get('/case-types', async (req, res) => {
  const { data, error } = await supabase.from('case_types').select('case_type_id, name').is('deleted_at', null).order('name');
  if (error) return fail(res, 'Could not load case types', 500);
  return ok(res, { caseTypes: data || [] });
});

router.post('/case-types', async (req, res) => {
  const { name } = req.body;
  if (!name) return fail(res, 'name is required', 400);

  const { data, error } = await supabase.from('case_types').insert({ name }).select('case_type_id').single();
  if (error) return fail(res, `Could not add case type: ${error.message}`, 500);

  await writeAuditLog({ officialId: req.auth.officialId, action: 'create', entityType: 'case_type', entityId: data.case_type_id });
  return ok(res, { caseTypeId: data.case_type_id }, 'Case type added', 201);
});

router.patch('/case-types/:caseTypeId', async (req, res) => {
  const { caseTypeId } = req.params;
  const { name } = req.body;
  if (!name) return fail(res, 'name is required', 400);

  const { error } = await supabase.from('case_types').update({ name }).eq('case_type_id', caseTypeId);
  if (error) return fail(res, `Could not update case type: ${error.message}`, 500);

  await writeAuditLog({ officialId: req.auth.officialId, action: 'update', entityType: 'case_type', entityId: caseTypeId });
  return ok(res, null, 'Case type updated');
});

router.delete('/case-types/:caseTypeId', async (req, res) => {
  const { caseTypeId } = req.params;

  const { error } = await supabase.from('case_types').update({ deleted_at: new Date().toISOString() }).eq('case_type_id', caseTypeId);
  if (error) return fail(res, `Could not remove case type: ${error.message}`, 500);

  await writeAuditLog({ officialId: req.auth.officialId, action: 'delete', entityType: 'case_type', entityId: caseTypeId });
  return ok(res, null, 'Case type removed');
});

router.get('/intervention-types', async (req, res) => {
  const { data, error } = await supabase.from('intervention_types').select('intervention_type_id, name').is('deleted_at', null).order('name');
  if (error) return fail(res, 'Could not load intervention types', 500);
  return ok(res, { interventionTypes: data || [] });
});

router.post('/intervention-types', async (req, res) => {
  const { name } = req.body;
  if (!name) return fail(res, 'name is required', 400);

  const { data, error } = await supabase.from('intervention_types').insert({ name }).select('intervention_type_id').single();
  if (error) return fail(res, `Could not add intervention type: ${error.message}`, 500);

  await writeAuditLog({ officialId: req.auth.officialId, action: 'create', entityType: 'intervention_type', entityId: data.intervention_type_id });
  return ok(res, { interventionTypeId: data.intervention_type_id }, 'Intervention type added', 201);
});

router.patch('/intervention-types/:interventionTypeId', async (req, res) => {
  const { interventionTypeId } = req.params;
  const { name } = req.body;
  if (!name) return fail(res, 'name is required', 400);

  const { error } = await supabase.from('intervention_types').update({ name }).eq('intervention_type_id', interventionTypeId);
  if (error) return fail(res, `Could not update intervention type: ${error.message}`, 500);

  await writeAuditLog({ officialId: req.auth.officialId, action: 'update', entityType: 'intervention_type', entityId: interventionTypeId });
  return ok(res, null, 'Intervention type updated');
});

router.delete('/intervention-types/:interventionTypeId', async (req, res) => {
  const { interventionTypeId } = req.params;

  const { error } = await supabase.from('intervention_types').update({ deleted_at: new Date().toISOString() }).eq('intervention_type_id', interventionTypeId);
  if (error) return fail(res, `Could not remove intervention type: ${error.message}`, 500);

  await writeAuditLog({ officialId: req.auth.officialId, action: 'delete', entityType: 'intervention_type', entityId: interventionTypeId });
  return ok(res, null, 'Intervention type removed');
});

router.get('/channels', async (req, res) => {
  const { data, error } = await supabase.from('channels').select('channel_id, channel_name').is('deleted_at', null).order('channel_name');
  if (error) return fail(res, 'Could not load channels', 500);
  return ok(res, { channels: data || [] });
});

router.post('/channels', async (req, res) => {
  const { channelName } = req.body;
  if (!channelName) return fail(res, 'channelName is required', 400);

  const { data, error } = await supabase.from('channels').insert({ channel_name: channelName }).select('channel_id').single();
  if (error) return fail(res, `Could not add channel: ${error.message}`, 500);

  await writeAuditLog({ officialId: req.auth.officialId, action: 'create', entityType: 'channel', entityId: data.channel_id });
  return ok(res, { channelId: data.channel_id }, 'Channel added', 201);
});

router.patch('/channels/:channelId', async (req, res) => {
  const { channelId } = req.params;
  const { channelName } = req.body;
  if (!channelName) return fail(res, 'channelName is required', 400);

  const { error } = await supabase.from('channels').update({ channel_name: channelName }).eq('channel_id', channelId);
  if (error) return fail(res, `Could not update channel: ${error.message}`, 500);

  await writeAuditLog({ officialId: req.auth.officialId, action: 'update', entityType: 'channel', entityId: channelId });
  return ok(res, null, 'Channel updated');
});

router.delete('/channels/:channelId', async (req, res) => {
  const { channelId } = req.params;

  const { error } = await supabase.from('channels').update({ deleted_at: new Date().toISOString() }).eq('channel_id', channelId);
  if (error) return fail(res, `Could not remove channel: ${error.message}`, 500);

  await writeAuditLog({ officialId: req.auth.officialId, action: 'delete', entityType: 'channel', entityId: channelId });
  return ok(res, null, 'Channel removed');
});

// ===== Feature Catalog Section 6.3 =====

// "Heatmaps by state / region" - pure aggregation, no new table. One row per
// state: victim count + average of each victim's most recent distress score.
router.get('/heatmap', async (req, res) => {
  const { data: states, error: stateError } = await supabase.from('jurisdictions').select('jurisdiction_id, name').eq('level', 'state');
  if (stateError) return fail(res, 'Could not load heatmap', 500);

  const heatmap = [];
  for (const state of states || []) {
    const descendantIds = await getDescendantJurisdictionIds(state.jurisdiction_id);
    const { data: victims } = await supabase
      .from('victims')
      .select('victim_id, distress_scores(score_value, computed_at)')
      .in('jurisdiction_id', descendantIds);

    let victimCount = 0;
    let scoreSum = 0;
    let scoredCount = 0;
    for (const v of victims || []) {
      victimCount += 1;
      const latest = (v.distress_scores || []).sort((a, b) => (a.computed_at < b.computed_at ? 1 : -1))[0];
      if (latest) {
        scoreSum += latest.score_value;
        scoredCount += 1;
      }
    }

    heatmap.push({
      jurisdictionId: state.jurisdiction_id,
      name: state.name,
      victimCount,
      averageScore: scoredCount > 0 ? Math.round((scoreSum / scoredCount) * 10) / 10 : null,
    });
  }

  return ok(res, { heatmap });
});

// "Connections with NHAA helpline IVRS" - visibility into IVRS dispatch
// activity (Section 1.3's dispatch_queue rows), not a new integration.
// Explicitly labeled as queued/attempted calls, not live call monitoring.
router.get('/ivrs-log', async (req, res) => {
  const { page = 1 } = req.query;
  const pageSize = 50;
  const offset = (Number(page) - 1) * pageSize;

  const { data, count, error } = await supabase
    .from('dispatch_queue')
    .select('dispatch_id, victim_id, attempt_count, delivered_at, created_at', { count: 'exact' })
    .eq('kind', 'ivrs_call')
    .order('created_at', { ascending: false })
    .range(offset, offset + pageSize - 1);
  if (error) return fail(res, 'Could not load IVRS log', 500);

  return ok(res, {
    entries: (data || []).map((d) => ({
      dispatchId: d.dispatch_id,
      victimId: d.victim_id,
      status: d.delivered_at ? 'delivered' : d.attempt_count > 0 ? 'attempted' : 'queued',
      attemptCount: d.attempt_count,
      queuedAt: d.created_at,
    })),
    total: count || 0,
    note: 'Reflects queued/attempted IVRS dispatches, not a live call-monitoring feed.',
  });
});

// "Receive Base-Level Reports" - lists what District/State/National
// generated via POST /api/admin/reports/generate.
router.get('/reports', async (req, res) => {
  const { jurisdictionLevel, page = 1 } = req.query;
  const pageSize = 30;
  const offset = (Number(page) - 1) * pageSize;

  let query = supabase
    .from('reports')
    .select('report_id, jurisdiction_id, generated_by, generated_at, period_start, period_end, snapshot, jurisdictions(name, level)', { count: 'exact' })
    .order('generated_at', { ascending: false });
  if (jurisdictionLevel) query = query.eq('jurisdictions.level', jurisdictionLevel);

  const { data, count, error } = await query.range(offset, offset + pageSize - 1);
  if (error) return fail(res, `Could not load reports: ${error.message}`, 500);

  return ok(res, {
    reports: (data || []).map((r) => ({
      reportId: r.report_id,
      jurisdictionId: r.jurisdiction_id,
      jurisdictionName: r.jurisdictions ? r.jurisdictions.name : null,
      jurisdictionLevel: r.jurisdictions ? r.jurisdictions.level : null,
      generatedBy: r.generated_by,
      generatedAt: r.generated_at,
      periodStart: r.period_start,
      periodEnd: r.period_end,
      snapshot: r.snapshot,
    })),
    total: count || 0,
  });
});

module.exports = router;
