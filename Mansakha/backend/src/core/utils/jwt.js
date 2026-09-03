const jwt = require('jsonwebtoken');

if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET must be set in .env');
}

// payload: for a user, { type: 'user', userId }.
// for staff/ministry, { type: 'official', officialId } - role/jurisdiction are
// deliberately NOT embedded here; verifyToken re-reads them from the DB on every
// request (Build Prompt Section 0b) so a revoked/reassigned account takes effect
// immediately instead of waiting for the token to expire.
//
// No default expiry (explicit request: victim/admin/counsellor/ministry
// sessions must never expire on their own - only an explicit Logout tap
// should end one). Every real login call site (auth.user, auth.staff,
// auth.ministry) calls this with no `expiresIn` override, so omitting the
// default here means none of those tokens carry an `exp` claim at all.
function signToken(payload, { expiresIn } = {}) {
  const options = expiresIn ? { expiresIn } : {};
  return jwt.sign(payload, process.env.JWT_SECRET, options);
}

function verifyJwt(token) {
  return jwt.verify(token, process.env.JWT_SECRET);
}

module.exports = { signToken, verifyJwt };
