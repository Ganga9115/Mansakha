const express = require('express');
const { findOfficialForLogin, verifyPassword } = require('../../core/services/staffLogin');
const { signToken } = require('../../core/utils/jwt');
const { ok, fail } = require('../../core/services/responseEnvelope');
const { staffLoginLimiter } = require('../../core/middleware/rateLimiter');
const { supabase } = require('../../core/db/supabaseClient');

const router = express.Router();

// Ministry Super-login - a distinct entry point from Staff Login, per Build Prompt
// Section 3 ("do not merge these into one login screen"). Ministry accounts are
// seeded/manually provisioned, not created through any signup flow.
router.post('/login', staffLoginLimiter, async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return fail(res, 'email and password are required', 400);

  const match = await findOfficialForLogin(email, ['Ministry']);
  if (!match) return fail(res, 'Invalid credentials', 401);

  const passwordOk = await verifyPassword(password, match.official.password_hash);
  if (!passwordOk) return fail(res, 'Invalid credentials', 401);

  // Resets the 8-hour inactivity clock (verifyToken.js) at login - see
  // auth.staff.routes.js's identical fix for why this can't be skipped:
  // without it, an account inactive >8h logs in fine but its very next
  // request is rejected as "expired," with no way to self-recover.
  const { error: lastActiveError } = await supabase
    .from('officials')
    .update({ last_active_at: new Date().toISOString() })
    .eq('official_id', match.official.official_id);
  // Required write, not best-effort - see auth.staff.routes.js's identical
  // check for why a silent failure here would reintroduce the inactivity-
  // lockout deadlock. Fail the login rather than hand out a dead-on-arrival
  // session; don't leak the DB error itself.
  if (lastActiveError) {
    console.error('POST /auth/ministry/login: could not reset last_active_at', lastActiveError.message);
    return fail(res, 'Could not complete login. Please try again.', 500);
  }

  const token = signToken({ type: 'official', officialId: match.official.official_id });
  return ok(res, { token, mustChangePassword: match.official.must_change_password });
});

module.exports = router;
