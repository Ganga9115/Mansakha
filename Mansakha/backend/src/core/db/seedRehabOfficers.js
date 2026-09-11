// Provisions Rehabilitation Officer accounts.
// ID scheme: RO-001, RO-002... (alphabetical by full name)
// Email: rehabilitationofficer001@mansakha.gov.in, rehabilitationofficer002@...
// Password: Mansakha@2026
// Idempotent - safe to re-run. Usage: npm run seed:rehab-officers

require('dotenv').config();
const bcrypt = require('bcrypt');
const { supabase } = require('./supabaseClient');

const PASSWORD = 'Mansakha@2026';
const DOMAIN = '@mansakha.gov.in';

function pad(n, width = 3) {
  return String(n).padStart(width, '0');
}

async function main() {
  const { data: role } = await supabase.from('roles').select('role_id').eq('role_name', 'Rehabilitation Officer').single();
  if (!role) throw new Error('Rehabilitation Officer role not found');

  // Find all existing RO accounts (sorted by name for stable ID assignment)
  const { data: existingROs } = await supabase
    .from('officials')
    .select('official_id, full_name, email')
    .order('full_name');

  // Filter to those with RO role
  const { data: roRoles } = await supabase.from('official_roles')
    .select('official_id').eq('role_id', role.role_id).is('revoked_at', null);
  const roOfficialIds = new Set(roRoles.map((r) => r.official_id));
  const ros = (existingROs || []).filter((o) => roOfficialIds.has(o.official_id));

  console.log(`Found ${ros.length} existing Rehabilitation Officer accounts to update.`);

  const passwordHash = await bcrypt.hash(PASSWORD, 12);

  for (let i = 0; i < ros.length; i++) {
    const ro = ros[i];
    const idx = pad(i + 1);
    const officialIdentifier = `RO-${idx}`;
    const newEmail = `rehabilitationofficer${idx}${DOMAIN}`;

    await supabase.from('officials').update({
      password_hash: passwordHash,
      must_change_password: false,
      staff_id: officialIdentifier,
      official_identifier: officialIdentifier,
      email: newEmail,
    }).eq('official_id', ro.official_id);

    console.log(`  Updated: ${ro.full_name} → ${officialIdentifier} / ${newEmail}`);
  }

  if (ros.length === 0) {
    console.log('No existing RO accounts found. Create them via District Admin UI and re-run this script.');
  }

  console.log(`\nDone. Password: ${PASSWORD}`);
}

main().catch((err) => { console.error('Seed failed:', err.message); process.exit(1); });
