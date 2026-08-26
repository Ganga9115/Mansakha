const express = require('express');
const { findOfficialForLogin, verifyPassword } = require('../services/staffLogin');
const { signToken } = require('../utils/jwt');
const { ok, fail } = require('../services/responseEnvelope');
const { staffLoginLimiter } = require('../middleware/rateLimiter');
const { verifyToken } = require('../middleware/verifyToken');
const { supabase } = require('../db/supabaseClient');
const bcrypt = require('bcrypt');

const router = express.Router();

// Staff Login surface - Administration (District/State/National) + Counsellor.
// Build Prompt Section 3: accounts are provisioned BY the Ministry, not self-signup.
//
// roleName is required and picks which role context this session runs under - the
// same official can hold both an Administration and a Counsellor role
// (official_roles is a join table, not a flat column), so login has to know which
// one is meant, the same reason a shared login surface needs a role toggle at all.
// Picking the role you don't actually hold fails here, not silently falls back to
// whichever role happened to be first.
const STAFF_LOGIN_ROLES = ['Administration', 'Counsellor', 'Data Operator'];

router.post('/login', staffLoginLimiter, async (req, res) => {
  const { email, password, roleName, staffId } = req.body;
  if (!email || !password || !staffId) return fail(res, 'email, password, and staffId are required', 400);
  if (!STAFF_LOGIN_ROLES.includes(roleName)) {
    return fail(res, `roleName must be one of: ${STAFF_LOGIN_ROLES.join(', ')}`, 400);
  }

  const match = await findOfficialForLogin(email, [roleName]);
  if (!match) return fail(res, `Invalid credentials, or this account has no active ${roleName} role`, 401);

  const passwordOk = await verifyPassword(password, match.official.password_hash);
  if (!passwordOk) return fail(res, 'Invalid credentials', 401);

  // Third required credential (Feature Catalog: "State Admin ID" etc., all
  // currently '1' - see migration_003_staff_id.sql). Same generic failure
  // message as a bad password, not "wrong ID", so a valid email+password
  // guess can't be used to probe for the right ID separately.
  if (String(staffId).trim() !== match.official.staff_id) return fail(res, 'Invalid credentials', 401);

  const token = signToken({ type: 'official', officialId: match.official.official_id, selectedRole: roleName });
  return ok(res, { token, mustChangePassword: match.official.must_change_password });
});

router.post('/change-password', verifyToken, async (req, res) => {
  if (req.auth.type !== 'official') return fail(res, 'Staff account required', 403);

  const { newPassword } = req.body;
  if (!newPassword || newPassword.length < 8) {
    return fail(res, 'newPassword must be at least 8 characters', 400);
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);
  const { error } = await supabase
    .from('officials')
    .update({ password_hash: passwordHash, must_change_password: false })
    .eq('official_id', req.auth.officialId);

  if (error) return fail(res, 'Could not update password', 500);
  return ok(res, null, 'Password updated');
});

module.exports = router;
