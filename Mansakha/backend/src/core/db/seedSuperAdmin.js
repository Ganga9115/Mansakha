// Creates (or updates) the Ministry Super Admin account, per Build Prompt Section 3:
// "seeded/manually provisioned - the top-level account(s)". Idempotent - safe to
// re-run; upserts rather than erroring if the account already exists.
//
// Credentials are fixed, deliberately-chosen values from .env (SUPER_ADMIN_EMAIL/
// PASSWORD/NAME), not randomly generated - this is a bootstrap account someone
// running this script has to already know, not a temp password handed out through
// the app like Administration/Counsellor accounts are.
//
// Usage: npm run seed:super-admin

require('dotenv').config();
const bcrypt = require('bcrypt');
const { supabase } = require('./supabaseClient');

async function ensureNationalJurisdiction() {
  const { data: existing } = await supabase.from('jurisdictions').select('jurisdiction_id, name').eq('level', 'national').limit(1).maybeSingle();
  if (existing) {
    console.log(`Using existing national jurisdiction: ${existing.name} (${existing.jurisdiction_id})`);
    return existing.jurisdiction_id;
  }
  const { data: created, error } = await supabase.from('jurisdictions').insert({ name: 'India', level: 'national', parent_id: null }).select('jurisdiction_id').single();
  if (error) throw new Error(`Could not create national jurisdiction: ${error.message}`);
  console.log(`Created national jurisdiction "India" (${created.jurisdiction_id})`);
  return created.jurisdiction_id;
}

async function ensureSuperAdmin() {
  const { SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD, SUPER_ADMIN_NAME } = process.env;
  if (!SUPER_ADMIN_EMAIL || !SUPER_ADMIN_PASSWORD) {
    throw new Error('SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD must be set in .env before seeding.');
  }

  const passwordHash = await bcrypt.hash(SUPER_ADMIN_PASSWORD, 12);
  const fullName = SUPER_ADMIN_NAME || 'Ministry Super Admin';

  const { data: existing } = await supabase.from('officials').select('official_id').eq('email', SUPER_ADMIN_EMAIL).maybeSingle();

  let officialId;
  if (existing) {
    const { error } = await supabase.from('officials').update({ password_hash: passwordHash, full_name: fullName, must_change_password: false }).eq('official_id', existing.official_id);
    if (error) throw new Error(`Could not update super admin: ${error.message}`);
    officialId = existing.official_id;
    console.log(`Updated existing Ministry Super Admin: ${SUPER_ADMIN_EMAIL}`);
  } else {
    const { data: created, error } = await supabase
      .from('officials')
      .insert({ full_name: fullName, email: SUPER_ADMIN_EMAIL, password_hash: passwordHash, must_change_password: false })
      .select('official_id')
      .single();
    if (error) throw new Error(`Could not create super admin: ${error.message}`);
    officialId = created.official_id;
    console.log(`Created Ministry Super Admin: ${SUPER_ADMIN_EMAIL}`);
  }

  const { data: role } = await supabase.from('roles').select('role_id').eq('role_name', 'Ministry').single();
  const { data: existingRole } = await supabase
    .from('official_roles')
    .select('official_role_id')
    .eq('official_id', officialId)
    .eq('role_id', role.role_id)
    .is('revoked_at', null)
    .maybeSingle();

  if (!existingRole) {
    // jurisdiction_id: null - Ministry is unrestricted across every jurisdiction,
    // per Section 3.
    const { error } = await supabase.from('official_roles').insert({ official_id: officialId, role_id: role.role_id, jurisdiction_id: null });
    if (error) throw new Error(`Could not assign Ministry role: ${error.message}`);
    console.log('Assigned Ministry role.');
  } else {
    console.log('Ministry role already assigned.');
  }
}

async function main() {
  await ensureNationalJurisdiction();
  await ensureSuperAdmin();
  console.log('\nSuper Admin seed complete. Log in at the Ministry Super-login screen with the credentials from .env.');
}

main().catch((err) => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});
