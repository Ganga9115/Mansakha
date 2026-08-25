const express = require('express');
const { findOfficialForLogin, verifyPassword } = require('../services/staffLogin');
const { signToken } = require('../utils/jwt');
const { ok, fail } = require('../services/responseEnvelope');
const { staffLoginLimiter } = require('../middleware/rateLimiter');

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

  const token = signToken({ type: 'official', officialId: match.official.official_id });
  return ok(res, { token, mustChangePassword: match.official.must_change_password });
});

module.exports = router;
