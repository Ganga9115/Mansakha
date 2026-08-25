const jwt = require('jsonwebtoken');

if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET must be set in .env');
}

const EXPIRES_IN = '8h';
const PENDING_REGISTRATION_EXPIRES_IN = '15m';

// payload: for a victim, { type: 'victim', victimId }.
// for staff/ministry, { type: 'official', officialId } - role/jurisdiction are
// deliberately NOT embedded here; verifyToken re-reads them from the DB on every
// request (Build Prompt Section 0b) so a revoked/reassigned account takes effect
// immediately instead of waiting for the token to expire.
// for a verified-but-not-yet-registered contact:
// { type: 'victim_pending', email? , phone? } - short-lived, only usable to
// complete registration for the exact contact that was just verified (see
// routes/auth.victim.js's /register).
function signToken(payload, { expiresIn = EXPIRES_IN } = {}) {
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn });
}

function signPendingRegistrationToken(payload) {
  return signToken({ ...payload, type: 'victim_pending' }, { expiresIn: PENDING_REGISTRATION_EXPIRES_IN });
}

function verifyJwt(token) {
  return jwt.verify(token, process.env.JWT_SECRET);
}

module.exports = { signToken, signPendingRegistrationToken, verifyJwt };
