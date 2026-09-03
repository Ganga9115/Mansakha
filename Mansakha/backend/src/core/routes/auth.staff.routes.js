const express = require('express');
const { findOfficialForLogin, verifyPassword } = require('../services/staffLogin');
const { signToken } = require('../utils/jwt');
const { ok, fail } = require('../services/responseEnvelope');
const { staffLoginLimiter } = require('../middleware/rateLimiter');
const { verifyToken } = require('../middleware/verifyToken');
const { supabase } = require('../db/supabaseClient');
const bcrypt = require('bcrypt');

const router = express.Router();

// Staff Login surface - Administration (District/State/National) + Counsellor +
// Data Operator. Build Prompt Section 3: accounts are provisioned BY the Ministry,
// not self-signup. Lives under core/ (not any one role's folder) since it's the
// one shared pre-role entry point - see this file's header note in
// core/services/staffLogin.js.
//
// roleName is required and picks which role context this session runs under - the
// same official can hold both an Administration and a Counsellor role
// (official_roles is a join table, not a flat column), so login has to know which
// one is meant, the same reason a shared login surface needs a role toggle at all.
// Picking the role you don't actually hold fails here, not silently falls back to
// whichever role happened to be first.
const STAFF_LOGIN_ROLES = ['Administration', 'Counsellor', 'Data Operator'];

router.post('/login', staffLoginLimiter, async (req, res) => {
  const { email, password, roleName } = req.body;
  if (!email || !password) return fail(res, 'email and password are required', 400);

  const rolesToSearch = (roleName && STAFF_LOGIN_ROLES.includes(roleName))
    ? [roleName]
    : STAFF_LOGIN_ROLES;

  const match = await findOfficialForLogin(email, rolesToSearch);
  if (!match) return fail(res, 'Invalid credentials', 401);

  const passwordOk = await verifyPassword(password, match.official.password_hash);
  if (!passwordOk) return fail(res, 'Invalid credentials', 401);

  const selectedRole = match.matchingRole.roles.role_name;

  // Resets the 8-hour inactivity clock (verifyToken.js) at the moment of
  // login - without this, an account that was last active more than 8h ago
  // logs in successfully, gets a valid token, and then its very first
  // subsequent request (even /change-password, right below) is immediately
  // rejected as "expired due to inactivity" - and stays that way forever,
  // since the only other place that refreshes this timestamp is gated
  // behind that same check. Confirmed live as a real, guaranteed-daily
  // lockout (anyone away >8h, i.e. overnight) before this fix.
  const { error: lastActiveError } = await supabase
    .from('officials')
    .update({ last_active_at: new Date().toISOString() })
    .eq('official_id', match.official.official_id);
  // This write is required, not best-effort - a silently-failed reset here
  // reintroduces the exact inactivity-lockout deadlock the comment above
  // describes (issue a token now, reject it on the very next request because
  // last_active_at never actually got refreshed). Fail the login rather than
  // hand out a session that's dead on arrival; don't leak the DB error itself.
  if (lastActiveError) {
    console.error('POST /auth/staff/login: could not reset last_active_at', lastActiveError.message);
    return fail(res, 'Could not complete login. Please try again.', 500);
  }

  const token = signToken({ type: 'official', officialId: match.official.official_id, selectedRole });
  return ok(res, { token, mustChangePassword: match.official.must_change_password, selectedRole });
});

router.post('/change-password', verifyToken, async (req, res) => {
  if (req.auth.type !== 'official') return fail(res, 'Staff account required', 403);

  const { newPassword } = req.body;
  if (!newPassword || newPassword.length < 8) {
    return fail(res, 'newPassword must be at least 8 characters', 400);
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);
  // password_changed_at lets verifyToken.js reject any token issued before
  // this change - the self-service equivalent of Ministry's reset fix. That
  // includes the very token used to make THIS request, so a fresh one is
  // issued below and returned - without it, the frontend's own post-change
  // flow (Login.jsx reuses this route's token to continue into the app)
  // would immediately hit "password changed, please log in again," the same
  // self-deadlock shape as the earlier inactivity-timeout bug.
  const { error } = await supabase
    .from('officials')
    .update({ password_hash: passwordHash, must_change_password: false, password_changed_at: new Date().toISOString() })
    .eq('official_id', req.auth.officialId);

  if (error) return fail(res, 'Could not update password', 500);

  const selectedRole = req.auth.roles.length === 1 ? req.auth.roles[0].roleName : undefined;
  const token = signToken({ type: 'official', officialId: req.auth.officialId, selectedRole });
  return ok(res, { token }, 'Password updated');
});

module.exports = router;
