// Provisions IO and PO accounts for every police station in the jurisdictions table.
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

async function ensureOfficialWithRole(fullName, email, officialIdentifier, stationId, roleId) {
  const passwordHash = await bcrypt.hash(PASSWORD, 12);

  const { data: existing } = await supabase.from('officials')
    .select('official_id').eq('email', email).maybeSingle();

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
    if (error) throw new Error(`Insert failed for ${email}: ${error.message}`);
    officialId = data.official_id;
  }

  // IO/PO are jurisdiction-scoped to the station's district
  const { rows: stationRows } = await pool.query(
    'select jurisdiction_id from police_stations where station_id = $1', [stationId]
  );
  const jurisdictionId = stationRows[0]?.jurisdiction_id;
  if (!jurisdictionId) throw new Error(`No jurisdiction for station ${stationId}`);

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

  // Load all police stations sorted alphabetically
  const { rows: stations } = await pool.query(
    'select station_id, name from police_stations where deleted_at is null order by name'
  );

  if (stations.length === 0) {
    console.warn('No police stations found. Run seed:jurisdictions first or add stations via the admin UI.');
    return;
  }

  console.log(`Provisioning IO+PO accounts for ${stations.length} police stations...`);

  let ioCreated = 0, poCreated = 0;
  for (let i = 0; i < stations.length; i++) {
    const station = stations[i];
    const slug = slugify(station.name);
    const idx = pad(i + 1);

    const io = await ensureOfficialWithRole(
      `${station.name} Investigating Officer`,
      `${slug}.io${DOMAIN}`,
      `IO-${idx}`,
      station.station_id,
      ioRole.role_id,
    );
    const po = await ensureOfficialWithRole(
      `${station.name} Protection Officer`,
      `${slug}.po${DOMAIN}`,
      `PO-${idx}`,
      station.station_id,
      poRole.role_id,
    );

    if (io.created) ioCreated++;
    if (po.created) poCreated++;
  }

  console.log(`\nDone. IO: ${ioCreated} created. PO: ${poCreated} created.`);
  console.log(`Password: ${PASSWORD}`);
  if (stations[0]) {
    const s = slugify(stations[0].name);
    console.log(`\nFirst station IO: IO-001 / ${s}.io${DOMAIN}`);
    console.log(`First station PO: PO-001 / ${s}.po${DOMAIN}`);
  }
}

main().then(() => pool.end()).catch((err) => {
  console.error('Seed failed:', err.message);
  pool.end();
  process.exit(1);
});
