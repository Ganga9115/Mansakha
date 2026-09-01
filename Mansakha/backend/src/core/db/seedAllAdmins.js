// Bulk-provisions one Administration login per real jurisdiction: National,
// every State/UT, and every District currently seeded in `jurisdictions`.
// Explicit user request - not part of the Feature Catalog's own scope, this
// is operational account setup for the live demo/testing dataset.
//
// Email convention (all @mansakha.gov.in, all password Mansakha2026):
//   National:  nationaladmin@mansakha.gov.in
//   State/UT:  <wholestatename>admin@mansakha.gov.in     e.g. himachalpradeshadmin@
//   District:  <district>.<statecode>@mansakha.gov.in    e.g. shimla.hp@ , aurangabad.mh@
// Every district email carries its state's standard 2-letter vehicle-
// registration code, which also resolves real Indian geography's occasional
// duplicate district names across different states (Aurangabad in both
// Maharashtra and Bihar, Bilaspur in both HP and Chhattisgarh, etc.) without
// any special-case handling - aurangabad.mh and aurangabad.br never collide.
// Full names get a matching official title ("Himachal Pradesh State
// Administrator", "Shimla District Administrator, Himachal Pradesh").
//
// Idempotent - safe to re-run (upserts by email, same pattern as
// seedDummyAccounts.js). Usage: npm run seed:all-admins

require('dotenv').config();
const bcrypt = require('bcrypt');
const { supabase } = require('./supabaseClient');

const PASSWORD = 'Mansakha2026';
const DOMAIN = '@mansakha.gov.in';
const CONCURRENCY = 15;

// Standard 2-letter Indian state/UT vehicle-registration codes, keyed by the
// jurisdiction name as seeded (post level-annotation strip - see
// titleCaseState). Missing/renamed jurisdictions (e.g. Ladakh, Andaman &
// Nicobar) aren't seeded yet per lookups.js's own state list, so aren't in
// this map - `main()` fails loudly on any state it can't find a code for,
// rather than silently skipping it.
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

// Turns "(" / ")" into spaces rather than deleting them, so a real
// disambiguating word inside parens (e.g. "Warangal (Rural)") still makes it
// into the slug - collapsing "Warangal (Rural)"/"Warangal (Urban)" down to
// the same "warangal" would silently merge two different real districts.
function slugify(name) {
  return name
    .replace(/[()]/g, ' ')
    .replace(/&/g, ' and ')
    .toLowerCase()
    .replace(/[^a-z]/g, '');
}

// States/UTs carry a literal "(UT)"/"(NCT)" annotation in the seed data that's
// a level marker, not part of the real name - stripped before slugifying so
// the email reads as the whole real state name, per the explicit request.
function titleCaseState(name) {
  return name.replace(/\s*\((UT|NCT)\)/gi, '').trim();
}

async function ensureOfficial(fullName, email, jurisdictionId, roleId) {
  const passwordHash = await bcrypt.hash(PASSWORD, 12);

  const { data: existing } = await supabase.from('officials').select('official_id').eq('email', email).maybeSingle();
  let officialId;
  if (existing) {
    officialId = existing.official_id;
    // must_change_password: true - every account the Ministry/Super Admin
    // provisions (this bulk seed included) forces a password change on
    // first login, same as accounts created through the real Staff
    // Management UI (routes/ministry.js's POST /staff). staff_id: '1' - the
    // login screen's "State Admin ID"/"District Admin ID"/etc. field,
    // explicit placeholder value for every account per user request
    // (requires migration_003_staff_id.sql to have been run).
    await supabase.from('officials').update({ password_hash: passwordHash, full_name: fullName, must_change_password: true, staff_id: '1' }).eq('official_id', officialId);
  } else {
    const { data, error } = await supabase
      .from('officials')
      .insert({ full_name: fullName, email, password_hash: passwordHash, must_change_password: true, staff_id: '1' })
      .select('official_id')
      .single();
    if (error) throw new Error(`Could not create official ${email}: ${error.message}`);
    officialId = data.official_id;
  }

  const { data: existingRole } = await supabase
    .from('official_roles')
    .select('official_role_id')
    .eq('official_id', officialId)
    .eq('role_id', roleId)
    .eq('jurisdiction_id', jurisdictionId)
    .is('revoked_at', null)
    .maybeSingle();

  if (!existingRole) {
    const { error } = await supabase.from('official_roles').insert({ official_id: officialId, role_id: roleId, jurisdiction_id: jurisdictionId });
    if (error) throw new Error(`Could not assign Administration role to ${email}: ${error.message}`);
  }

  return { email, created: !existing };
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
  if (roleError || !role) throw new Error('Could not find the Administration role - is roles seeded?');

  const { data: national, error: nationalError } = await supabase.from('jurisdictions').select('jurisdiction_id, name').eq('level', 'national').limit(1).maybeSingle();
  if (nationalError || !national) throw new Error('No national jurisdiction found - run `npm run seed:super-admin` first.');

  const { data: states, error: statesError } = await supabase.from('jurisdictions').select('jurisdiction_id, name').eq('level', 'state').order('name');
  if (statesError) throw new Error(`Could not load states: ${statesError.message}`);

  const { data: districts, error: districtsError } = await supabase.from('jurisdictions').select('jurisdiction_id, name, parent_id').eq('level', 'district').order('name');
  if (districtsError) throw new Error(`Could not load districts: ${districtsError.message}`);

  const missingCodes = states.map((s) => titleCaseState(s.name)).filter((n) => !STATE_CODES[n]);
  if (missingCodes.length > 0) {
    throw new Error(`No state code mapped for: ${missingCodes.join(', ')} - add them to STATE_CODES before running.`);
  }

  const stateNameById = new Map(states.map((s) => [s.jurisdiction_id, titleCaseState(s.name)]));
  const stateCodeById = new Map(states.map((s) => [s.jurisdiction_id, STATE_CODES[titleCaseState(s.name)].toLowerCase()]));

  const jobs = [];

  jobs.push({ fullName: 'National Administrator', email: `nationaladmin${DOMAIN}`, jurisdictionId: national.jurisdiction_id });

  for (const s of states) {
    const name = titleCaseState(s.name);
    jobs.push({ fullName: `${name} State Administrator`, email: `${slugify(name)}admin${DOMAIN}`, jurisdictionId: s.jurisdiction_id });
  }

  // Same-state duplicate-slug check remains as a safety net (a genuine seed
  // data dupe - two rows for what's really one district - would still
  // collide even with the state code appended); cross-state collisions are
  // already resolved by the per-state code itself.
  const seenEmails = new Map();
  const realDupes = [];
  for (const d of districts) {
    const stateCode = stateCodeById.get(d.parent_id);
    const stateName = stateNameById.get(d.parent_id) || '';
    const email = `${slugify(d.name)}.${stateCode}${DOMAIN}`;
    if (seenEmails.has(email)) {
      realDupes.push([seenEmails.get(email), `${d.name} (${stateName})`]);
    }
    seenEmails.set(email, `${d.name} (${stateName})`);
    jobs.push({ fullName: `${d.name} District Administrator, ${stateName}`, email, jurisdictionId: d.jurisdiction_id });
  }

  console.log(`Provisioning ${jobs.length} Administration accounts (1 national + ${states.length} state/UT + ${districts.length} district)...`);

  const results = await runWithConcurrency(jobs, CONCURRENCY, (job) => ensureOfficial(job.fullName, job.email, job.jurisdictionId, role.role_id));

  const createdCount = results.filter((r) => r.created).length;
  console.log(`\nDone. ${createdCount} created, ${results.length - createdCount} already existed (password/name refreshed on those too).`);
  console.log(`All passwords: ${PASSWORD}`);

  if (realDupes.length > 0) {
    console.log(`\nWarning - these districts share BOTH state and slug (likely a duplicate jurisdiction row in the seed data, not a real distinct district):`);
    realDupes.forEach(([a, b]) => console.log(`  - ${a} / ${b}`));
  }
}

main().catch((err) => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});
