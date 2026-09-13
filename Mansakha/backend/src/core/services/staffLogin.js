const bcrypt = require('bcrypt');
const { supabase } = require('../db/supabaseClient');

// Shared by core/routes/auth.staff.routes.js (Administration + Counsellor + Data
// Operator) and core/routes/auth.signin.routes.js (DWO, IO, PO, DLSA, RO, etc.)
// The underlying provisioned-account check is the same shape, filtered to a
// different set of allowed roles per surface.
//
// migration_046: official_identifier IS the primary login key for all staff roles
// (SUP-001, NA-001, SA-001, IO-001, PO-001, RO-001, CON-001, DWO-001...).
// Email is accepted as a secondary fallback for convenience but IDs are canonical.
// Try official_identifier first (exact, case-insensitive), then email.
async function findOfficialForLogin(identifier, allowedRoleNames) {
  const normalised = (identifier || '').trim().toLowerCase();

  // Primary: look up by official_identifier
  let { data: official } = await supabase
    .from('officials')
    .select('official_id, email, password_hash, must_change_password, official_identifier, staff_id, phone')
    .ilike('official_identifier', normalised)
    .maybeSingle();

  // Fallback: look up by email if identifier didn't match any ID
  if (!official) {
    const { data: byEmail } = await supabase
      .from('officials')
      .select('official_id, email, password_hash, must_change_password, official_identifier, staff_id, phone')
      .ilike('email', normalised)
      .maybeSingle();
    // Backward-compatible fallback for generic legacy emails
    if (!official && normalised === 'counsellor@mansakha.gov.in') {
      const { data: byAlias } = await supabase
        .from('officials')
        .select('official_id, email, password_hash, must_change_password, official_identifier, staff_id, phone')
        .ilike('official_identifier', 'CON-001')
        .maybeSingle();
      official = byAlias;
    }
    if (!official && normalised === 'dataoperator@mansakha.gov.in') {
      const { data: byAlias } = await supabase
        .from('officials')
        .select('official_id, email, password_hash, must_change_password, official_identifier, staff_id, phone')
        .ilike('official_identifier', 'DO-001')
        .maybeSingle();
      official = byAlias;
    }
  }

  if (!official) return null;

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
