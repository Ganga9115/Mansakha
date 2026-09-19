// Adds multiple Counsellor accounts per district - the existing
// seedCounsellors.js only re-indexes a handful of hand-picked demo
// counsellors (CON-001..CON-006 today), it was never meant to give every
// district real coverage the way seedPoliceStations.js/seedRehabOfficers.js
// do for IO/PO/RO. This script adds COUNT_PER_DISTRICT new ones per
// district on top of whatever already exists, continuing the CON- numbering
// from the current max rather than touching existing accounts.
//
// ID scheme: CON-<n>, continuing from the current highest CON- number.
// Email: <fullnameslug>.<id-lowercased>@mansakha.gov.in (explicit request).
// Password: Mansakha@2026. Idempotent per official_identifier - safe to
// re-run, though re-running adds another COUNT_PER_DISTRICT batch since
// there's no natural per-district existing-count check the way
// seedPoliceStations.js has via station name.

require('dotenv').config();
const bcrypt = require('bcrypt');
const { supabase } = require('./supabaseClient');
const { pool } = require('./pgPool');

const PASSWORD = 'Mansakha@2026';
const DOMAIN = '@mansakha.gov.in';
const COUNT_PER_DISTRICT = 2;

const FIRST_NAMES = ['Aarav', 'Vivaan', 'Aditya', 'Vihaan', 'Arjun', 'Ishaan', 'Kabir', 'Rohan', 'Diya', 'Riya', 'Saanvi', 'Anaya', 'Priya', 'Meera', 'Kavya', 'Ananya'];
const LAST_NAMES = ['Sharma', 'Verma', 'Patel', 'Singh', 'Reddy', 'Das', 'Nair', 'Gupta', 'Iyer', 'Chauhan', 'Mehta', 'Joshi'];

function slugify(name) {
  return name.replace(/[^a-zA-Z0-9 ]/g, '').toLowerCase().replace(/\s+/g, '');
}

async function main() {
  const { rows: roleRows } = await pool.query("select role_id from roles where role_name = 'Counsellor'");
  if (!roleRows[0]) throw new Error('Counsellor role not found');
  const roleId = roleRows[0].role_id;

  const { rows: districts } = await pool.query("select jurisdiction_id, name from jurisdictions where level = 'district' order by name");
  console.log(`Adding ${COUNT_PER_DISTRICT} Counsellor(s) to each of ${districts.length} districts...`);

  const { rows: maxRows } = await pool.query(
    "select coalesce(max((regexp_match(official_identifier, '^CON-(\\d+)$'))[1]::int), 0) as max_n from officials where official_identifier ~ '^CON-\\d+$'"
  );
  let counter = maxRows[0].max_n;

  const passwordHash = await bcrypt.hash(PASSWORD, 12);
  const officialsBatch = [];
  const meta = [];

  for (const d of districts) {
    for (let i = 0; i < COUNT_PER_DISTRICT; i += 1) {
      counter += 1;
      const officialIdentifier = `CON-${counter}`;
      const fullName = `${FIRST_NAMES[counter % FIRST_NAMES.length]} ${LAST_NAMES[(counter * 7) % LAST_NAMES.length]}`;
      const email = `${slugify(fullName)}.${officialIdentifier.toLowerCase()}${DOMAIN}`;
      officialsBatch.push({
        full_name: fullName, email, password_hash: passwordHash,
        must_change_password: false, staff_id: officialIdentifier, official_identifier: officialIdentifier,
      });
      meta.push({ jurisdictionId: d.jurisdiction_id, districtName: d.name });
    }
  }

  console.log(`Inserting ${officialsBatch.length} new officials in batches...`);
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

  console.log(`\nDone. Added ${insertedIds.length} Counsellors across ${districts.length} districts.`);
  console.log(`Password for all: ${PASSWORD}`);
  console.log(`Sample: ${officialsBatch[0]?.official_identifier} / ${officialsBatch[0]?.email}`);
}

main().then(() => process.exit(0)).catch((err) => { console.error('Seed failed:', err.message); process.exit(1); });
