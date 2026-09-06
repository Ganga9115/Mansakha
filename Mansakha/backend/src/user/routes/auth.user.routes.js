const express = require('express');
const bcrypt = require('bcrypt');
const { supabase } = require('../../core/db/supabaseClient');
const { pool } = require('../../core/db/pgPool');
const { signToken } = require('../../core/utils/jwt');
const { ok, fail } = require('../../core/services/responseEnvelope');
const { verifyToken } = require('../../core/middleware/verifyToken');
const { userLoginLimiter, gpsLookupLimiter } = require('../../core/middleware/rateLimiter');

const router = express.Router();

// User Login surface - Feature Catalog Section 1.1, extended per explicit
// request. Replaces the old OTP (mobile/email) + Google Sign-In +
// self-registration model entirely: a user record is now created BY staff
// (District Admin - district_admin/routes/districtAdmin.routes.js, or Data Operator -
// dataoperator/routes/dataoperator.routes.js), and a user logs in with FOUR fields staff entered
// for them - docket number, full name, mobile number, and a password
// (fixed to 'User123' at creation, forced to change on first login via
// must_change_password, same pattern as officials). otpService.js,
// twilioVerify.js, mailer.js, and the Google OAuth client stay removed -
// nothing here revives them.

// Escapes LIKE/ILIKE special characters so an exact case-insensitive match
// can't be turned into a wildcard pattern by a crafted docketNumber (e.g. a
// literal "%" or "_" in the input).
function escapeLikePattern(str) {
  return str.replace(/[%_\\]/g, '\\$&');
}

router.post('/login', userLoginLimiter, async (req, res) => {
  const { docketNumber, password } = req.body;
  if (!docketNumber || !password) {
    return fail(res, 'docketNumber and password are required', 400);
  }

  const genericFailure = () => fail(res, 'No matching record found - check your details and try again', 401);

  console.log('User login attempt for docket:', docketNumber);
  // Raw pg (not Supabase REST), self-joined to the anchor in one round trip -
  // this is the single hottest endpoint in the app (every login hits it),
  // and the previous version made a SECOND sequential PostgREST call
  // (~1-2s) just to read the anchor's password/status whenever this docket
  // was a linked/dependent case. The join is a no-op (anchor columns come
  // back null) for the common single-case login, so this is a pure win
  // either way, not a tradeoff.
  const { rows } = await pool.query(
    `select u.user_id, u.password_hash, u.must_change_password, u.status, u.linked_to_user_id,
            anchor.password_hash as anchor_password_hash, anchor.status as anchor_status
     from users u
     left join users anchor on anchor.user_id = u.linked_to_user_id
     where u.docket_number ilike $1
     limit 1`,
    [escapeLikePattern(docketNumber.trim())]
  );
  const user = rows[0];

  if (!user) {
    console.log('User not found for docket:', docketNumber);
    return genericFailure();
  }

  // Multi-case support: this docket's row may be a "dependent" case pointing
  // at another row (the "anchor") via linked_to_user_id - a person with
  // several cases still has exactly one identity/session/counsellor, resolved
  // through the anchor. must_change_password is checked on THIS row (a
  // freshly-linked case starts with its own temp password, same as any new
  // case) but once this docket's own temp password has been changed, the
  // password and account-status checks both move to the anchor's row - see
  // POST /change-password below, which writes the new password to every row
  // in the family so it becomes "the" password for every docket the person
  // has, not just the one they changed it through.
  const anchorUserId = user.linked_to_user_id || user.user_id;
  const anchorPasswordHash = user.linked_to_user_id ? user.anchor_password_hash : user.password_hash;
  const anchorStatus = user.linked_to_user_id ? user.anchor_status : user.status;
  if (user.linked_to_user_id && anchorPasswordHash == null) {
    console.error('User login: could not load anchor for linked case', anchorUserId);
    return genericFailure();
  }

  const hashToCheck = user.must_change_password ? user.password_hash : anchorPasswordHash;
  const passwordOk = hashToCheck && await bcrypt.compare(password, hashToCheck);
  if (!passwordOk) {
    console.log('Password mismatch for user:', user.user_id);
    return genericFailure();
  }

  // Login never checked `status` - an inactive user (e.g. a case a Data
  // Operator marked inactive) could log in fine and receive a real token,
  // then have every single subsequent request rejected by verifyToken.js's
  // own status check (it does check this, on every request) - a confusing
  // "login succeeds, then immediately logged back out" loop, first hit on
  // whatever the app's first authenticated call after login happens to be.
  // Checked only after password verification succeeds, so this doesn't leak
  // account existence to a docket-guessing attacker (they'd need the correct
  // password already to ever see this branch). Checked on the ANCHOR's
  // status, since that's the identity the token actually carries.
  if (anchorStatus !== 'active') {
    console.log('Login blocked - inactive account:', anchorUserId);
    return fail(res, 'This account has been deactivated. Please contact your assigned counsellor or administrator.', 403);
  }

  console.log('User login successful for:', anchorUserId, user.linked_to_user_id ? `(via linked docket ${user.user_id})` : '');

  const token = signToken({ type: 'user', userId: anchorUserId });
  return ok(res, { token, mustChangePassword: user.must_change_password });
});

// Re-added per explicit request (was removed when the login model dropped
// passwords entirely, then reinstated when they came back as a 4th
// credential). Mirrors core/routes/auth.staff.routes.js's change-password route exactly.
router.post('/change-password', verifyToken, async (req, res) => {
  if (req.auth.type !== 'user') return fail(res, 'User account required', 403);

  const { newPassword } = req.body;
  if (!newPassword || newPassword.length < 8) {
    return fail(res, 'newPassword must be at least 8 characters', 400);
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);
  // req.auth.userId is always the anchor (see POST /login above) - updating
  // by `user_id = anchor OR linked_to_user_id = anchor` in one statement
  // propagates the new password to every docket in the case family at once,
  // so it becomes "the" password for every case the person has, not just
  // whichever docket they happened to change it through.
  const { error } = await supabase
    .from('users')
    .update({ password_hash: passwordHash, must_change_password: false })
    .or(`user_id.eq.${req.auth.userId},linked_to_user_id.eq.${req.auth.userId}`);

  if (error) return fail(res, 'Could not update password', 500);
  return ok(res, null, 'Password updated');
});

// Loosely normalizes a jurisdiction name for comparison against OpenStreetMap's
// naming, which won't always exactly match our seeded names (e.g. "NCT of
// Delhi" vs "Delhi", "Bengaluru Urban" vs "Bengaluru").
function namesLooselyMatch(a, b) {
  const normalize = (s) => (s || '').toLowerCase()
    .replace(/\b(district|state|nct of|union territory of)\b/g, '')
    .replace(/th/g, 't')
    .replace(/[^a-z]/g, '');
  return normalize(a) === normalize(b) && normalize(a).length > 0;
}

// Feature Catalog Section 1.1 - "Auto-detect State & District (GPS)". Public
// (called pre-login, from the Login screen's optional convenience button),
// rate-limited since it's an unauthenticated route making a third-party call
// on the caller's behalf. Always responds 200 with nulls on any failure to
// find/match a location - this is optional convenience, never a blocker, so
// it should never surface as an error the user has to dismiss.
router.post('/gps-lookup', gpsLookupLimiter, async (req, res) => {
  const { lat, lng } = req.body;
  if (typeof lat !== 'number' || typeof lng !== 'number') {
    return fail(res, 'lat and lng (numbers) are required', 400);
  }

  let osm;
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=jsonv2&addressdetails=1`;
    const osmRes = await fetch(url, {
      // Nominatim's usage policy requires a real identifying User-Agent.
      headers: { 'User-Agent': 'Mansakha-SIH26094/1.0 (user GPS state/district lookup)' },
    });
    if (!osmRes.ok) throw new Error(`Nominatim error (${osmRes.status})`);
    osm = await osmRes.json();
  } catch (err) {
    console.warn('GPS lookup: reverse-geocode failed, returning empty match:', err.message);
    return ok(res, { stateName: null, jurisdictionId: null });
  }

  const address = osm?.address || {};
  const osmState = address.state;
  const osmDistrict = address.state_district || address.county || address.district;
  if (!osmState) return ok(res, { stateName: null, jurisdictionId: null });

  const { rows: states } = await pool.query(`select jurisdiction_id, name from jurisdictions where level = 'state'`);
  const matchedState = (states || []).find((s) => namesLooselyMatch(s.name, osmState));
  if (!matchedState) {
    console.warn(`GPS lookup: no seeded state matched OSM state "${osmState}"`);
    return ok(res, { stateName: null, jurisdictionId: null });
  }

  let matchedJurisdictionId = null;
  if (osmDistrict) {
    const { rows: districts } = await pool.query(
      `select jurisdiction_id, name from jurisdictions where level = 'district' and parent_id = $1`,
      [matchedState.jurisdiction_id]
    );
    const matchedDistrict = (districts || []).find((d) => namesLooselyMatch(d.name, osmDistrict));
    matchedJurisdictionId = matchedDistrict ? matchedDistrict.jurisdiction_id : null;
  }

  return ok(res, { stateName: matchedState.name, jurisdictionId: matchedJurisdictionId });
});

module.exports = router;
