const { verifyJwt } = require('../utils/jwt');
const { pool } = require('../db/pgPool');
const { fail } = require('../services/responseEnvelope');

// Staff/admin/ministry only (explicit request) - 8 hours of no activity, not
// 8 hours from login. The JWT itself carries no `exp` claim any more (see
// utils/jwt.js), so this sliding window - a DB timestamp checked and
// refreshed on every request - is what actually enforces it. Victim/user
// accounts skip this entirely (never auto-logout, regardless of inactivity).
const OFFICIAL_INACTIVITY_TIMEOUT_MS = 8 * 60 * 60 * 1000;

// Checks the JWT, then RE-READS the caller's current state from the database on
// every request rather than trusting only what's embedded in the token - Build
// Prompt Section 0b. This is what makes suspending/reassigning a Counsellor or
// Administration account take effect immediately, not after their token expires.
//
// Runs on nearly every request in the app, so its own latency is felt
// everywhere - previously two sequential Supabase REST calls (each with its
// own ~1-2s round trip, confirmed live elsewhere this session), now one raw
// pg query via the existing connection pool. Same exact checks/error
// messages as before, just fewer round trips to get there.
async function verifyToken(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return fail(res, 'Missing or invalid Authorization header', 401);

  let payload;
  try {
    payload = verifyJwt(token);
  } catch (err) {
    return fail(res, 'Invalid or expired token', 401);
  }

  if (payload.type === 'user') {
    const { rows } = await pool.query('select user_id, status from users where user_id = $1', [payload.userId]);
    const user = rows[0];

    if (!user || user.status !== 'active') {
      return fail(res, 'Account not found or inactive', 401);
    }

    req.auth = { type: 'user', userId: user.user_id };
    return next();
  }

  if (payload.type === 'official') {
    const { rows } = await pool.query(
      `select o.official_id, o.must_change_password, o.last_active_at, o.password_changed_at, orr.jurisdiction_id, orr.provider_id, orr.station_id, r.role_name, j.level as jurisdiction_level
       from officials o
       left join official_roles orr on orr.official_id = o.official_id and orr.revoked_at is null
       left join roles r on r.role_id = orr.role_id
       left join jurisdictions j on j.jurisdiction_id = orr.jurisdiction_id
       where o.official_id = $1`,
      [payload.officialId]
    );

    if (rows.length === 0) {
      return fail(res, 'Account not found', 401);
    }

    // Tokens carry no `exp`, so without this a password reset/change
    // (Ministry's "reset a compromised password" action, or self-service
    // /change-password) never actually invalidated a session already issued -
    // a hijacked token stayed fully valid indefinitely, undermining the one
    // thing that action is meant to do. `iat` (seconds) is added to every
    // token automatically by jsonwebtoken; a null password_changed_at means
    // "never changed since this column existed," treated as not-a-reason-to-
    // reject, same null-safe pattern as last_active_at below.
    // 1000ms grace: `iat` is second-precision (jsonwebtoken truncates via
    // Math.floor) while password_changed_at is sub-second, and the
    // freshly-reissued token from /change-password is signed a few ms AFTER
    // that timestamp is captured - without this buffer, truncation could put
    // the new token's own `iat` a fraction of a second "before" its own
    // password_changed_at and reject the very token meant to replace the old
    // one. A 1s window makes no practical difference against an actually-old
    // stolen token.
    const passwordChangedAt = rows[0].password_changed_at;
    if (passwordChangedAt && payload.iat && payload.iat * 1000 < new Date(passwordChangedAt).getTime() - 1000) {
      return fail(res, 'Your password was changed. Please log in again.', 401);
    }

    // Sliding inactivity window (staff/admin/ministry only - see the
    // OFFICIAL_INACTIVITY_TIMEOUT_MS comment above). `last_active_at` is
    // null on an official's very first authenticated request after login,
    // which is deliberately treated as "not expired" rather than failing
    // closed - it gets set below either way, so every request after that
    // one is correctly checked against a real timestamp.
    const lastActiveAt = rows[0].last_active_at;
    if (lastActiveAt && Date.now() - new Date(lastActiveAt).getTime() > OFFICIAL_INACTIVITY_TIMEOUT_MS) {
      return fail(res, 'Session expired due to inactivity. Please log in again.', 401);
    }
    // Fire-and-forget - refreshing the sliding window must not add this
    // query's latency to every single authenticated request in the app.
    pool.query('update officials set last_active_at = now() where official_id = $1', [payload.officialId])
      .catch((err) => console.error('verifyToken: could not refresh last_active_at', err.message));

    // A LEFT JOIN with zero matching official_roles still returns one row
    // (every joined column null) rather than zero rows - that's the "exists
    // but has no active role" case, distinct from "official_id doesn't
    // exist at all" above.
    const roleRows = rows.filter((r) => r.role_name !== null);
    if (roleRows.length === 0) {
      return fail(res, 'No active role assigned to this account', 403);
    }

    let effectiveRoleRows = roleRows;
    if (payload.selectedRole) {
      // Staff Login pins which role context this session runs under (an official
      // can hold both Administration and Counsellor at once) - re-validated live
      // against the DB on every request, same as everything else here, not
      // trusted from the token. If the role was revoked since login, this fails
      // now rather than silently falling back to a different role.
      effectiveRoleRows = roleRows.filter((r) => r.role_name === payload.selectedRole);
      if (effectiveRoleRows.length === 0) {
        return fail(res, `Your ${payload.selectedRole} role is no longer active`, 403);
      }
    }

    req.auth = {
      type: 'official',
      officialId: rows[0].official_id,
      mustChangePassword: rows[0].must_change_password,
      roles: effectiveRoleRows.map((r) => ({
        roleName: r.role_name,
        jurisdictionId: r.jurisdiction_id,
        jurisdictionLevel: r.jurisdiction_level,
        // migration_031 - which rehabilitation_providers row a Rehabilitation
        // Officer works for, mirroring jurisdictionId's own per-role-grant
        // pattern. Always null for every other role.
        providerId: r.provider_id,
        // migration_033 - which police_stations row an Investigating
        // Officer works at, same per-role-grant pattern again. Always null
        // for every other role.
        stationId: r.station_id,
      })),
    };
    return next();
  }

  return fail(res, 'Unrecognized token type', 401);
}

module.exports = { verifyToken };
