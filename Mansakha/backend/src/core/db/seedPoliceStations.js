// Provisions IO and PO accounts for every police station in the jurisdictions table.
// If a district has no police station, it will create one first.
// ID Scheme (alphabetical by station name):
//   IO-001, IO-002... for Investigating Officers
//   PO-001, PO-002... for Protection Officers
//
// Email convention:
//   stationname.io@mansakha.gov.in   e.g. kotwali.io@mansakha.gov.in
//   stationname.po@mansakha.gov.in   e.g. kotwali.po@mansakha.gov.in
//
// Password: Mansakha@2026  (must_change_password: false for demo convenience)
// Idempotent - safe to re-run. Usage: npm run seed:police-stations

require('dotenv').config();
const bcrypt = require('bcrypt');
const { supabase } = require('./supabaseClient');
const { pool } = require('./pgPool');

const PASSWORD = 'Mansakha@2026';
const DOMAIN = '@mansakha.gov.in';

function slugify(name) {
  return name.replace(/[()]/g, ' ').replace(/&/g, ' and ').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function pad(n, width = 3) {
  return String(n).padStart(width, '0');
}

async function ensureOfficialWithRole(fullName, email, officialIdentifier, stationId, jurisdictionId, roleId) {
  const passwordHash = await bcrypt.hash(PASSWORD, 12);

  const { data: existing } = await supabase.from('officials')
    .select('official_id').eq('official_identifier', officialIdentifier).maybeSingle();

  let officialId;
  if (existing) {
    officialId = existing.official_id;
    await supabase.from('officials').update({
      password_hash: passwordHash, full_name: fullName,
      must_change_password: false, staff_id: officialIdentifier,
      email: email,
    }).eq('official_id', officialId);
  } else {
    const { data, error } = await supabase.from('officials').insert({
      full_name: fullName, email, password_hash: passwordHash,
      must_change_password: false, staff_id: officialIdentifier,
      official_identifier: officialIdentifier,
    }).select('official_id').single();
    if (error) throw new Error(`Insert failed for ${email}: ${error.message}`);
    officialId = data.official_id;
  }

  const { data: existingRole } = await supabase.from('official_roles')
    .select('official_role_id').eq('official_id', officialId)
    .eq('role_id', roleId).eq('jurisdiction_id', jurisdictionId).is('revoked_at', null).maybeSingle();

  if (!existingRole) {
    const { error } = await supabase.from('official_roles').insert({
      official_id: officialId, role_id: roleId, jurisdiction_id: jurisdictionId,
      station_id: stationId,
    });
    if (error) throw new Error(`Role assign failed for ${email}: ${error.message}`);
  }

  return { email, officialIdentifier, created: !existing };
}

async function main() {
  // Load role IDs
  const { data: roles } = await supabase.from('roles')
    .select('role_id, role_name')
    .in('role_name', ['Investigating Officer', 'Protection Officer']);
  const ioRole = roles.find((r) => r.role_name === 'Investigating Officer');
  const poRole = roles.find((r) => r.role_name === 'Protection Officer');
  if (!ioRole || !poRole) throw new Error('IO or PO role not found in roles table');

  // Load all districts
  const { rows: districts } = await pool.query('select jurisdiction_id, name, parent_id from jurisdictions where level = $1', ['district']);
  
  const { rows: states } = await pool.query('select jurisdiction_id, name from jurisdictions where level = $1', ['state']);
  const stateCodeById = new Map();
  states.forEach(s => {
    let name = s.name.replace(/\s*\((UT|NCT)\)/gi, '').trim();
    stateCodeById.set(s.jurisdiction_id, name.substring(0, 2).toLowerCase());
  });

  // Ensure every district has at least one police station
  console.log(`Ensuring police stations exist for ${districts.length} districts...`);
  
  const { rows: existingStations } = await pool.query('select station_id, name, jurisdiction_id from police_stations where deleted_at is null');
  const stationsByDistrict = new Map();
  for (const st of existingStations) {
    if (!stationsByDistrict.has(st.jurisdiction_id)) stationsByDistrict.set(st.jurisdiction_id, []);
    stationsByDistrict.get(st.jurisdiction_id).push(st);
  }

  const finalStations = [...existingStations];
  for (const d of districts) {
    if (!stationsByDistrict.has(d.jurisdiction_id)) {
      const stateCode = stateCodeById.get(d.parent_id) || 'xx';
      const psName = `${d.name} Sadar Police Station, ${stateCode.toUpperCase()}`;
      const { rows: inserted } = await pool.query(
        'INSERT INTO police_stations (name, jurisdiction_id) VALUES ($1, $2) RETURNING station_id, name, jurisdiction_id',
        [psName, d.jurisdiction_id]
      );
      finalStations.push({ ...inserted[0], parent_id: d.parent_id });
    } else {
      for (const st of stationsByDistrict.get(d.jurisdiction_id)) {
        st.parent_id = d.parent_id;
      }
    }
  }

  // Load all police stations sorted alphabetically
  finalStations.sort((a, b) => a.name.localeCompare(b.name));

  console.log(`Provisioning IO+PO accounts for ${finalStations.length} police stations...`);

  let ioCreated = 0, poCreated = 0;
  
  // Concurrency
  const CONCURRENCY = 10;
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

  await runWithConcurrency(finalStations, CONCURRENCY, async (station, i) => {
    const slug = slugify(station.name);
    const stateCode = stateCodeById.get(station.parent_id) || 'xx';
    const idx = pad(i + 1);

    const io = await ensureOfficialWithRole(
      `${station.name} Investigating Officer`,
      `${slug}.io.${stateCode}${DOMAIN}`,
      `IO-${idx}`,
      station.station_id,
      station.jurisdiction_id,
      ioRole.role_id,
    );
    const po = await ensureOfficialWithRole(
      `${station.name} Protection Officer`,
      `${slug}.po.${stateCode}${DOMAIN}`,
      `PO-${idx}`,
      station.station_id,
      station.jurisdiction_id,
      poRole.role_id,
    );

    if (io.created) ioCreated++;
    if (po.created) poCreated++;
  });

  console.log(`\nDone. IO: ${ioCreated} created. PO: ${poCreated} created.`);
  console.log(`Password: ${PASSWORD}`);
  if (finalStations[0]) {
    const s = slugify(finalStations[0].name);
    console.log(`\nFirst station IO: IO-001 / ${s}.io${DOMAIN}`);
    console.log(`First station PO: PO-001 / ${s}.po${DOMAIN}`);
  }
}

main().then(() => pool.end()).catch((err) => {
  console.error('Seed failed:', err.message);
  pool.end();
  process.exit(1);
});
