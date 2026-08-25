const { verifyJwt } = require('../utils/jwt');
const { supabase } = require('../db/supabaseClient');
const { fail } = require('../services/responseEnvelope');

// Checks the JWT, then RE-READS the caller's current state from the database on
// every request rather than trusting only what's embedded in the token - Build
// Prompt Section 0b. This is what makes suspending/reassigning a Counsellor or
// Administration account take effect immediately, not after their token expires.
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
    const { data: victim, error } = await supabase
      .from('victims')
      .select('victim_id, status')
      .eq('victim_id', payload.victimId)
      .single();

    if (error || !victim || victim.status !== 'active') {
      return fail(res, 'Account not found or inactive', 401);
    }

    req.auth = { type: 'victim', victimId: victim.victim_id };
    return next();
  }

  if (payload.type === 'official') {
    const { data: official, error } = await supabase
      .from('officials')
      .select('official_id, must_change_password')
      .eq('official_id', payload.officialId)
      .single();

    if (error || !official) {
      return fail(res, 'Account not found', 401);
    }

    const { data: roleRows, error: roleError } = await supabase
      .from('official_roles')
      .select('role_id, jurisdiction_id, roles(role_name), jurisdictions(level)')
      .eq('official_id', official.official_id)
      .is('revoked_at', null);

    if (roleError || !roleRows || roleRows.length === 0) {
      return fail(res, 'No active role assigned to this account', 403);
    }

    let effectiveRoleRows = roleRows;
    if (payload.selectedRole) {
      // Staff Login pins which role context this session runs under (an official
      // can hold both Administration and Counsellor at once) - re-validated live
      // against the DB on every request, same as everything else here, not
      // trusted from the token. If the role was revoked since login, this fails
      // now rather than silently falling back to a different role.
      effectiveRoleRows = roleRows.filter((r) => r.roles.role_name === payload.selectedRole);
      if (effectiveRoleRows.length === 0) {
        return fail(res, `Your ${payload.selectedRole} role is no longer active`, 403);
      }
    }

    req.auth = {
      type: 'official',
      officialId: official.official_id,
      mustChangePassword: official.must_change_password,
      roles: effectiveRoleRows.map((r) => ({
        roleName: r.roles.role_name,
        jurisdictionId: r.jurisdiction_id,
        jurisdictionLevel: r.jurisdictions ? r.jurisdictions.level : null,
      })),
    };
    return next();
  }

  return fail(res, 'Unrecognized token type', 401);
}

module.exports = { verifyToken };
