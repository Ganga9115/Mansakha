const express = require('express');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { supabase } = require('../db/supabaseClient');
const { writeAuditLog } = require('../services/auditLog');
const { verifyToken } = require('../middleware/verifyToken');
const { requireRole } = require('../middleware/requireRole');
const { generalApiLimiter } = require('../middleware/rateLimiter');
const { ok, fail } = require('../services/responseEnvelope');

const router = express.Router();

router.use(verifyToken, requireRole(['Ministry']), generalApiLimiter);

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
  const { fullName, email, roleName, jurisdictionId } = req.body;
  if (!fullName || !email || !roleName) return fail(res, 'fullName, email, and roleName are required', 400);

  // Server-side allowlist, not trusting client input: this endpoint can ONLY create
  // Administration/Counsellor accounts. A Ministry account is seeded/manually
  // provisioned (Section 3) and must never be creatable through an API call, even
  // if a client sent roleName: "Ministry".
  if (!['Administration', 'Counsellor'].includes(roleName)) {
    return fail(res, 'roleName must be Administration or Counsellor', 400);
  }
  if (roleName === 'Administration' && !jurisdictionId) {
    return fail(res, 'jurisdictionId is required for Administration accounts', 400);
  }

  const { data: roleRow } = await supabase.from('roles').select('role_id').eq('role_name', roleName).single();

  const tempPassword = crypto.randomBytes(9).toString('base64url');
  const passwordHash = await bcrypt.hash(tempPassword, 12);

  const { data: official, error: officialError } = await supabase
    .from('officials')
    .insert({ full_name: fullName, email, password_hash: passwordHash, must_change_password: true, provisioned_by: req.auth.officialId })
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

  // Temp password returned once, here, so the Ministry operator can hand it to the
  // new official out-of-band - it's never retrievable again (only the hash is
  // stored), and must_change_password forces them to replace it on first login.
  return ok(res, { officialId: official.official_id, tempPassword }, 'Account created', 201);
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
  if (!['Administration', 'Counsellor'].includes(roleName)) return fail(res, 'roleName must be Administration or Counsellor', 400);
  if (roleName === 'Administration' && !jurisdictionId) return fail(res, 'jurisdictionId is required for Administration accounts', 400);

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

module.exports = router;
