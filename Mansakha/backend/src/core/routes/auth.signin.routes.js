const express = require('express');
const { findOfficialForLogin, verifyPassword } = require('../services/staffLogin');
const { signToken } = require('../utils/jwt');
const { ok, fail } = require('../services/responseEnvelope');
const { staffLoginLimiter } = require('../middleware/rateLimiter');
const { supabase } = require('../db/supabaseClient');

const router = express.Router();

// "Signin" - the shared pre-role login surface for the 6 new coordination
// roles (District Welfare Officer, Investigating Officer, Protection
// Officer, DLSA Coordinator, Special Public Prosecutor, District
// Magistrate), kept as its OWN file rather than extending
// auth.staff.routes.js's STAFF_LOGIN_ROLES - same reasoning Ministry already
// uses for its own separate auth.ministry.routes.js: a distinct login
// surface, not a widening of the existing one. Reuses
// core/services/staffLogin.js's findOfficialForLogin/verifyPassword (the one
// deliberate shared-login exception, see that file's own header comment) and
// mirrors auth.staff.routes.js's /login handler byte-for-byte in shape,
// including the last_active_at reset (without it, an account idle >8h logs
// in successfully but its very next request is rejected as inactive - a real
// bug this session already fixed once for the staff login surface).
//
// /change-password is deliberately NOT duplicated here - the existing
// core/routes/auth.staff.routes.js's POST /change-password only checks
// req.auth.type === 'official' (role-agnostic), so it already works for
// these accounts unmodified. Signin.jsx's forced-password-change flow
// posts to /api/auth/staff/change-password, same as every other role.
// Special Public Prosecutor stays retired (absorbed into DLSA Coordinator).
// Investigating Officer is REINSTATED (migration_033, see server.js's own
// comment on the same change) with real substance - station-scoped, its own
// investigation_records.
const SIGNIN_ROLES = [
  'Investigating Officer',
  'District Welfare Officer',
  'Protection Officer',
  'DLSA Coordinator',
  'District Collector',
  'Rehabilitation Officer',
];

router.post('/login', staffLoginLimiter, async (req, res) => {
  const { email, password, roleName } = req.body;
  if (!email || !password) return fail(res, 'email and password are required', 400);

  const rolesToSearch = (roleName && SIGNIN_ROLES.includes(roleName))
    ? [roleName]
    : SIGNIN_ROLES;

  const match = await findOfficialForLogin(email, rolesToSearch);
  if (!match) return fail(res, 'Invalid credentials', 401);

  const passwordOk = await verifyPassword(password, match.official.password_hash);
  if (!passwordOk) return fail(res, 'Invalid credentials', 401);

  const selectedRole = match.matchingRole.roles.role_name;

  // Same required (not best-effort) last_active_at reset as
  // auth.staff.routes.js's /login - see that file's own comment for why
  // skipping this creates a guaranteed daily lockout for anyone away >8h.
  const { error: lastActiveError } = await supabase
    .from('officials')
    .update({ last_active_at: new Date().toISOString() })
    .eq('official_id', match.official.official_id);
  if (lastActiveError) {
    console.error('POST /auth/signin/login: could not reset last_active_at', lastActiveError.message);
    return fail(res, 'Could not complete login. Please try again.', 500);
  }

  const token = signToken({ type: 'official', officialId: match.official.official_id, selectedRole });
  return ok(res, { token, mustChangePassword: match.official.must_change_password, selectedRole });
});

module.exports = router;
