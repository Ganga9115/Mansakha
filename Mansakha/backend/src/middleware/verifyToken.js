const { verifyJwt } = require('../utils/jwt');
const { pool } = require('../db/pgPool');
const { fail } = require('../services/responseEnvelope');

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

  if (payload.type === 'victim') {
    const { rows } = await pool.query('select victim_id, status from victims where victim_id = $1', [payload.victimId]);
    const victim = rows[0];

    if (!victim || victim.status !== 'active') {
      return fail(res, 'Account not found or inactive', 401);
    }

    req.auth = { type: 'victim', victimId: victim.victim_id };
    return next();
  }

  if (payload.type === 'official') {
    const { rows } = await pool.query(
      `select o.official_id, o.must_change_password, orr.jurisdiction_id, r.role_name, j.level as jurisdiction_level
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
      })),
    };
    return next();
  }

  return fail(res, 'Unrecognized token type', 401);
}

module.exports = { verifyToken };
