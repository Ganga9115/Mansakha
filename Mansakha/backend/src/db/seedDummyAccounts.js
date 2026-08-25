// Dummy accounts for testing every login surface/role - NOT the same as Section
// 10's full demo dataset (15-20 victims across every risk level, realistic
// check-in history - that's a separate, larger, still-tracked task in
// LAST_PRIORITY.md). This is just enough to log in as each role once: one
// District, State, and National Administration account, one Counsellor, and one
// Victim (using the dev-only fixed-OTP bypass in routes/auth.victim.js).
//
// Fixed, deliberately-chosen credentials (not randomly generated), same pattern
// as seedSuperAdmin.js. Idempotent - safe to re-run.
//
// Usage: npm run seed:dummy

require('dotenv').config();
const bcrypt = require('bcrypt');
const { supabase } = require('./supabaseClient');

const PASSWORD = 'Mansakha@2026';

async function ensureJurisdiction(name, level, parentId) {
  const { data: existing } = await supabase.from('jurisdictions').select('jurisdiction_id').eq('name', name).eq('level', level).maybeSingle();
  if (existing) {
    console.log(`Using existing ${level} jurisdiction: ${name}`);
    return existing.jurisdiction_id;
  }
  const { data, error } = await supabase.from('jurisdictions').insert({ name, level, parent_id: parentId }).select('jurisdiction_id').single();
  if (error) throw new Error(`Could not create ${level} jurisdiction "${name}": ${error.message}`);
  console.log(`Created ${level} jurisdiction: ${name}`);
  return data.jurisdiction_id;
}

async function ensureOfficial(fullName, email, roleName, jurisdictionId) {
  const passwordHash = await bcrypt.hash(PASSWORD, 12);

  const { data: existing } = await supabase.from('officials').select('official_id').eq('email', email).maybeSingle();
  let officialId;
  if (existing) {
    officialId = existing.official_id;
    await supabase.from('officials').update({ password_hash: passwordHash, full_name: fullName, must_change_password: false }).eq('official_id', officialId);
    console.log(`Updated existing official: ${email}`);
  } else {
    const { data, error } = await supabase.from('officials').insert({ full_name: fullName, email, password_hash: passwordHash, must_change_password: false }).select('official_id').single();
    if (error) throw new Error(`Could not create official ${email}: ${error.message}`);
    officialId = data.official_id;
    console.log(`Created official: ${email}`);
  }

  const { data: role } = await supabase.from('roles').select('role_id').eq('role_name', roleName).single();
  const { data: existingRole } = await supabase
    .from('official_roles').select('official_role_id').eq('official_id', officialId).eq('role_id', role.role_id).is('revoked_at', null).maybeSingle();
  if (!existingRole) {
    const { error } = await supabase.from('official_roles').insert({ official_id: officialId, role_id: role.role_id, jurisdiction_id: jurisdictionId });
    if (error) throw new Error(`Could not assign ${roleName} role to ${email}: ${error.message}`);
    console.log(`Assigned ${roleName} role to ${email}`);
  } else {
    console.log(`${roleName} role already assigned to ${email}`);
  }
}

async function ensureDummyVictim(nationalId, districtId) {
  const email = 'victim@gmail.com';
  const { data: existing } = await supabase.from('victim_identity').select('victim_id').eq('email', email).maybeSingle();
  if (existing) {
    console.log(`Dummy victim already exists: ${email}`);
    return;
  }

  const { data: caseType } = await supabase.from('case_types').select('case_type_id').eq('name', 'Witness Facing Intimidation or Threats').single();

  const { data: victim, error: victimError } = await supabase
    .from('victims')
    .insert({
      docket_number: 'DUMMY-0001',
      case_type_id: caseType.case_type_id,
      jurisdiction_id: districtId,
      case_stage: 'Investigation',
      auth_method: 'email_otp',
    })
    .select('victim_id')
    .single();
  if (victimError) throw new Error(`Could not create dummy victim: ${victimError.message}`);

  const { error: identityError } = await supabase
    .from('victim_identity')
    .insert({ victim_id: victim.victim_id, full_name: 'Dummy Victim', email });
  if (identityError) throw new Error(`Could not create dummy victim identity: ${identityError.message}`);

  console.log(`Created dummy victim: ${email} (docket DUMMY-0001)`);
}

async function main() {
  if (process.env.NODE_ENV !== 'development') {
    console.error('Refusing to seed dummy accounts outside NODE_ENV=development.');
    process.exit(1);
  }

  const { data: national } = await supabase.from('jurisdictions').select('jurisdiction_id').eq('level', 'national').limit(1).maybeSingle();
  if (!national) throw new Error('No national jurisdiction found - run `npm run seed:super-admin` first.');

  const stateId = await ensureJurisdiction('Maharashtra', 'state', national.jurisdiction_id);
  const districtId = await ensureJurisdiction('Pune', 'district', stateId);

  await ensureOfficial('Dummy District Admin', 'district.admin@mansakha.gov.in', 'Administration', districtId);
  await ensureOfficial('Dummy State Admin', 'state.admin@mansakha.gov.in', 'Administration', stateId);
  await ensureOfficial('Dummy National Admin', 'national.admin@mansakha.gov.in', 'Administration', national.jurisdiction_id);
  await ensureOfficial('Dummy Counsellor', 'counsellor@mansakha.gov.in', 'Counsellor', districtId);

  await ensureDummyVictim(national.jurisdiction_id, districtId);

  console.log('\nDummy accounts ready. All staff passwords: ' + PASSWORD);
  console.log('Victim: victim@gmail.com, Email OTP tab, code 123456 (dev-only fixed code).');
}

main().catch((err) => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});
