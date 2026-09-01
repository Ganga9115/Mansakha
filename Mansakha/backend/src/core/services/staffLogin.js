const bcrypt = require('bcrypt');
const { supabase } = require('../db/supabaseClient');

// Shared by core/routes/auth.staff.routes.js (Administration + Counsellor + Data
// Operator) and ministry/routes/auth.ministry.routes.js (Ministry) - Build Prompt
// Section 3: three distinct login SURFACES, but the underlying provisioned-account
// check is the same shape, just filtered to a different set of allowed roles per
// surface. This is the one deliberate exception to "no shared imports across role
// folders" - the staff login page is a pre-role entry point (the app can't know
// which role folder to route into before login tells it the role), and the user
// asked for it to keep working exactly as it does today.
async function findOfficialForLogin(email, allowedRoleNames) {
  const { data: official, error } = await supabase
    .from('officials')
    .select('official_id, email, password_hash, must_change_password, staff_id, phone')
    .eq('email', email)
    .single();

  if (error || !official) return null;

  const { data: roleRows } = await supabase
    .from('official_roles')
    .select('role_id, jurisdiction_id, roles(role_name)')
    .eq('official_id', official.official_id)
    .is('revoked_at', null);

  const matchingRole = (roleRows || []).find((r) => allowedRoleNames.includes(r.roles.role_name));
  if (!matchingRole) return null;

  return { official, matchingRole };
}

async function verifyPassword(plainPassword, passwordHash) {
  return bcrypt.compare(plainPassword, passwordHash);
}

module.exports = { findOfficialForLogin, verifyPassword };
