// Bulk-provisions Administration logins for every jurisdiction with structured IDs.
// migration_046: adds official_identifier to every account.
//
// ID Scheme (alphabetical order within each tier):
//   Super Admin:  SUP-001
//   National:     NA-001
//   State/UT:     SA-001 ... SA-N  (sorted A-Z)
//   District:     DA-001 ... DA-N  (sorted A-Z)
//
// Email convention (@mansakha.gov.in, password Mansakha@2026):
//   Super Admin:  superadmin@
//   National:     nationaladmin@
//   State/UT:     statename@         e.g. himachalpradesh@
//   District:     districtname.xx@   e.g. shimla.hp@  (xx = 2-letter state vehicle code)
//
// Idempotent - safe to re-run (upserts by email). Usage: npm run seed:all-admins

require('dotenv').config();
const bcrypt = require('bcrypt');
const { supabase } = require('./supabaseClient');

const PASSWORD = 'Mansakha@2026';
const DOMAIN = '@mansakha.gov.in';
const CONCURRENCY = 15;

const STATE_CODES = {
  'Andhra Pradesh': 'AP', 'Arunachal Pradesh': 'AR', 'Assam': 'AS', 'Bihar': 'BR',
  'Chandigarh': 'CH', 'Chhattisgarh': 'CG', 'Dadra and Nagar Haveli': 'DN',
  'Daman and Diu': 'DD', 'Delhi': 'DL', 'Goa': 'GA', 'Gujarat': 'GJ',
  'Haryana': 'HR', 'Himachal Pradesh': 'HP', 'Jammu and Kashmir': 'JK',
  'Jharkhand': 'JH', 'Karnataka': 'KA', 'Kerala': 'KL', 'Lakshadweep': 'LD',
  'Madhya Pradesh': 'MP', 'Maharashtra': 'MH', 'Manipur': 'MN', 'Meghalaya': 'ML',
  'Mizoram': 'MZ', 'Nagaland': 'NL', 'Odisha': 'OD', 'Puducherry': 'PY',
  'Punjab': 'PB', 'Rajasthan': 'RJ', 'Sikkim': 'SK', 'Tamil Nadu': 'TN',
  'Telangana': 'TS', 'Tripura': 'TR', 'Uttar Pradesh': 'UP', 'Uttarakhand': 'UK',
  'West Bengal': 'WB',
};

function slugify(name) {
  return name.replace(/[()]/g, ' ').replace(/&/g, ' and ').toLowerCase().replace(/[^a-z]/g, '');
}

function titleCaseState(name) {
  return name.replace(/\s*\((UT|NCT)\)/gi, '').trim();
}

function pad(n, width = 3) {
  return String(n).padStart(width, '0');
}

async function ensureOfficial(fullName, email, officialIdentifier, jurisdictionId, roleId) {
  const passwordHash = await bcrypt.hash(PASSWORD, 12);

  const { data: existing } = await supabase.from('officials').select('official_id').eq('email', email).maybeSingle();
  let officialId;
  if (existing) {
    officialId = existing.official_id;
    await supabase.from('officials').update({
      password_hash: passwordHash, full_name: fullName,
      must_change_password: false, staff_id: officialIdentifier,
      official_identifier: officialIdentifier,
    }).eq('official_id', officialId);
  } else {
    const { data, error } = await supabase.from('officials').insert({
      full_name: fullName, email, password_hash: passwordHash,
      must_change_password: false, staff_id: officialIdentifier,
      official_identifier: officialIdentifier,
    }).select('official_id').single();
    if (error) throw new Error(`Could not create official ${email}: ${error.message}`);
    officialId = data.official_id;
  }

  const { data: existingRole } = await supabase.from('official_roles')
    .select('official_role_id').eq('official_id', officialId)
    .eq('role_id', roleId).eq('jurisdiction_id', jurisdictionId).is('revoked_at', null).maybeSingle();

  if (!existingRole) {
    const { error } = await supabase.from('official_roles').insert({
      official_id: officialId, role_id: roleId, jurisdiction_id: jurisdictionId,
    });
    if (error) throw new Error(`Could not assign Administration role to ${email}: ${error.message}`);
  }

  return { email, officialIdentifier, created: !existing };
}

async function runWithConcurrency(items, limit, worker) {
  const results = [];
  let index = 0;
  async function next() {
    while (index < items.length) {
      const i = index++;
      results[i] = await worker(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, next));
  return results;
}

async function main() {
  const { data: role, error: roleError } = await supabase.from('roles').select('role_id').eq('role_name', 'Administration').single();
  if (roleError || !role) throw new Error('Could not find the Administration role');

  const { data: national } = await supabase.from('jurisdictions').select('jurisdiction_id, name').eq('level', 'national').limit(1).maybeSingle();
  if (!national) throw new Error('No national jurisdiction found');

  const { data: states } = await supabase.from('jurisdictions').select('jurisdiction_id, name').eq('level', 'state').order('name');
  const { data: districts } = await supabase.from('jurisdictions').select('jurisdiction_id, name, parent_id').eq('level', 'district').order('name');

  const missingCodes = states.map((s) => titleCaseState(s.name)).filter((n) => !STATE_CODES[n]);
  if (missingCodes.length > 0) throw new Error(`No state code for: ${missingCodes.join(', ')}`);

  const stateNameById = new Map(states.map((s) => [s.jurisdiction_id, titleCaseState(s.name)]));
  const stateCodeById = new Map(states.map((s) => [s.jurisdiction_id, STATE_CODES[titleCaseState(s.name)].toLowerCase()]));

  // --- Super Admin ---
  // Keep only superadmin@mansakha.gov.in, remove duplicates
  const { data: superRole } = await supabase.from('roles').select('role_id').eq('role_name', 'Ministry').single();
  if (superRole) {
    await ensureOfficial('Super Administrator', `superadmin${DOMAIN}`, 'SUP-001', national.jurisdiction_id, superRole.role_id);
  }

  const jobs = [];

  // National Admin - NA-001 (delete extras, keep only nationaladmin@)
  jobs.push({
    fullName: 'National Administrator', email: `nationaladmin${DOMAIN}`,
    identifier: 'NA-001', jurisdictionId: national.jurisdiction_id,
  });

  // State/UT admins — sorted alphabetically by state name → SA-001, SA-002...
  const sortedStates = [...states].sort((a, b) => a.name.localeCompare(b.name));
  sortedStates.forEach((s, i) => {
    const name = titleCaseState(s.name);
    jobs.push({
      fullName: `${name} State Administrator`,
      email: `${slugify(name)}${DOMAIN}`,
      identifier: `SA-${pad(i + 1)}`,
      jurisdictionId: s.jurisdiction_id,
    });
  });

  // District admins — sorted alphabetically by district name → DA-001, DA-002...
  const sortedDistricts = [...districts].sort((a, b) => a.name.localeCompare(b.name));
  const seenEmails = new Map();
  sortedDistricts.forEach((d, i) => {
    const stateCode = stateCodeById.get(d.parent_id);
    const stateName = stateNameById.get(d.parent_id) || '';
    const email = `${slugify(d.name)}.${stateCode}${DOMAIN}`;
    if (!seenEmails.has(email)) {
      seenEmails.set(email, true);
      jobs.push({
        fullName: `${d.name} District Administrator, ${stateName}`,
        email,
        identifier: `DA-${pad(i + 1)}`,
        jurisdictionId: d.jurisdiction_id,
      });
    }
  });

  console.log(`Provisioning ${jobs.length} Administration accounts...`);
  const results = await runWithConcurrency(jobs, CONCURRENCY, (job) =>
    ensureOfficial(job.fullName, job.email, job.identifier, job.jurisdictionId, role.role_id)
  );

  const created = results.filter((r) => r.created).length;
  console.log(`\nDone. ${created} created, ${results.length - created} updated.`);
  console.log(`Password for all: ${PASSWORD}`);
  console.log('\nSample IDs:');
  console.log('  Super Admin:    SUP-001  /  superadmin@mansakha.gov.in');
  console.log('  National Admin: NA-001   /  nationaladmin@mansakha.gov.in');
  console.log(`  First State:    SA-001   /  ${slugify(titleCaseState(sortedStates[0]?.name || 'state'))}@mansakha.gov.in`);
}

main().catch((err) => { console.error('Seed failed:', err.message); process.exit(1); });
