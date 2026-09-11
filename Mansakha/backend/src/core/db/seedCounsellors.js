// Provisions Counsellor accounts with structured IDs.
// ID scheme: CON-001, CON-002... (alphabetical by full name)
// Email: slug-of-fullname + 3-digit-counter + @mansakha.gov.in
//   e.g. "Sunita Sharma" → CON-001 → sunitasharma001@mansakha.gov.in
// Password: Mansakha@2026
// Idempotent - safe to re-run. Usage: npm run seed:counsellors

require('dotenv').config();
const bcrypt = require('bcrypt');
const { supabase } = require('./supabaseClient');

const PASSWORD = 'Mansakha@2026';
const DOMAIN = '@mansakha.gov.in';

function slugify(name) {
  return name.replace(/[^a-zA-Z0-9 ]/g, '').toLowerCase().replace(/\s+/g, '');
}

function pad(n, width = 3) {
  return String(n).padStart(width, '0');
}

async function main() {
  const { data: role } = await supabase.from('roles').select('role_id').eq('role_name', 'Counsellor').single();
  if (!role) throw new Error('Counsellor role not found');

  // Find all existing Counsellor accounts sorted by name for stable ID assignment
  const { data: allOfficials } = await supabase.from('officials')
    .select('official_id, full_name, email').order('full_name');

  const { data: conRoles } = await supabase.from('official_roles')
    .select('official_id').eq('role_id', role.role_id).is('revoked_at', null);
  const conOfficialIds = new Set(conRoles.map((r) => r.official_id));
  const counsellors = (allOfficials || []).filter((o) => conOfficialIds.has(o.official_id));

  console.log(`Found ${counsellors.length} existing Counsellor accounts to update.`);

  const passwordHash = await bcrypt.hash(PASSWORD, 12);

  for (let i = 0; i < counsellors.length; i++) {
    const c = counsellors[i];
    const idx = pad(i + 1);
    const officialIdentifier = `CON-${idx}`;
    const nameSlug = slugify(c.full_name || `counsellor${idx}`);
    const newEmail = `${nameSlug}${idx}${DOMAIN}`;

    await supabase.from('officials').update({
      password_hash: passwordHash,
      must_change_password: false,
      staff_id: officialIdentifier,
      official_identifier: officialIdentifier,
      email: newEmail,
    }).eq('official_id', c.official_id);

    console.log(`  Updated: ${c.full_name} → ${officialIdentifier} / ${newEmail}`);
  }

  if (counsellors.length === 0) {
    console.log('No existing Counsellor accounts found. Create them via District Admin UI and re-run.');
  }

  console.log(`\nDone. Password: ${PASSWORD}`);
}

main().catch((err) => { console.error('Seed failed:', err.message); process.exit(1); });
