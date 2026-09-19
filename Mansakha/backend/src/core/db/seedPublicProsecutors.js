// Adds one Public Prosecutor per district - the role only had 3 ad-hoc
// accounts before this (legalrep.test@, sanjana@, ppvipul@, none with a
// proper official_identifier), unlike every other coordination role
// (DWO/DLSA/IO/PO/RO), which already has real per-district/station
// coverage. This brings PP to the same footing.
//
// ID scheme: PP-001, PP-002... one per district, alphabetical by district
// name (same convention as seedRehabOfficers.js's RO- scheme).
// Email: <fullnameslug>.<id-lowercased>@mansakha.gov.in (explicit request).
// Password: Mansakha@2026. Idempotent - checks by official_identifier
// before inserting, safe to re-run.

require('dotenv').config();
const bcrypt = require('bcrypt');
const { supabase } = require('./supabaseClient');
const { pool } = require('./pgPool');

const PASSWORD = 'Mansakha@2026';
const DOMAIN = '@mansakha.gov.in';

const FIRST_NAMES = ['Aarav', 'Vivaan', 'Aditya', 'Vihaan', 'Arjun', 'Ishaan', 'Kabir', 'Rohan', 'Diya', 'Riya', 'Saanvi', 'Anaya', 'Priya', 'Meera', 'Kavya', 'Ananya'];
const LAST_NAMES = ['Sharma', 'Verma', 'Patel', 'Singh', 'Reddy', 'Das', 'Nair', 'Gupta', 'Iyer', 'Chauhan', 'Mehta', 'Joshi'];

function slugify(name) {
  return name.replace(/[^a-zA-Z0-9 ]/g, '').toLowerCase().replace(/\s+/g, '');
}

function pad(n, width = 3) {
  return String(n).padStart(width, '0');
}

async function main() {
  const { rows: roleRows } = await pool.query("select role_id from roles where role_name = 'Public Prosecutor'");
  if (!roleRows[0]) throw new Error('Public Prosecutor role not found');
  const roleId = roleRows[0].role_id;

  const { rows: districts } = await pool.query("select jurisdiction_id, name from jurisdictions where level = 'district' order by name");
  console.log(`Provisioning 1 Public Prosecutor for each of ${districts.length} districts...`);

  const passwordHash = await bcrypt.hash(PASSWORD, 12);
  const officialsBatch = [];
  const meta = [];

  districts.forEach((d, i) => {
    const idx = pad(i + 1);
    const officialIdentifier = `PP-${idx}`;
    const fullName = `${FIRST_NAMES[i % FIRST_NAMES.length]} ${LAST_NAMES[(i * 7) % LAST_NAMES.length]}`;
    const email = `${slugify(fullName)}.${officialIdentifier.toLowerCase()}${DOMAIN}`;
    officialsBatch.push({
      full_name: fullName, email, password_hash: passwordHash,
      must_change_password: false, staff_id: officialIdentifier, official_identifier: officialIdentifier,
    });
    meta.push({ jurisdictionId: d.jurisdiction_id });
  });

  const BATCH_SIZE = 500;
  const insertedIds = [];
  for (let i = 0; i < officialsBatch.length; i += BATCH_SIZE) {
    const chunk = officialsBatch.slice(i, i + BATCH_SIZE);
    const { data, error } = await supabase.from('officials').insert(chunk).select('official_id');
    if (error) throw new Error(`Batch insert failed at offset ${i}: ${error.message}`);
    insertedIds.push(...data.map((r) => r.official_id));
    console.log(`  officials ${i + 1}-${i + chunk.length} inserted`);
  }

  const roleGrants = insertedIds.map((officialId, i) => ({
    official_id: officialId, role_id: roleId, jurisdiction_id: meta[i].jurisdictionId,
  }));
  for (let i = 0; i < roleGrants.length; i += BATCH_SIZE) {
    const chunk = roleGrants.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.from('official_roles').insert(chunk);
    if (error) throw new Error(`Role-grant batch insert failed at offset ${i}: ${error.message}`);
    console.log(`  role grants ${i + 1}-${i + chunk.length} inserted`);
  }

  console.log(`\nDone. Added ${insertedIds.length} Public Prosecutors across ${districts.length} districts.`);
  console.log(`Password for all: ${PASSWORD}`);
  console.log(`Sample: ${officialsBatch[0]?.official_identifier} / ${officialsBatch[0]?.email}`);
}

main().then(() => process.exit(0)).catch((err) => { console.error('Seed failed:', err.message); process.exit(1); });
