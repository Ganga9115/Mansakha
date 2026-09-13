// Provisions Data Operator accounts with structured IDs.
// ID scheme: DO-001, DO-002...
// Email: slug-of-fullname + 3-digit-counter + @mansakha.gov.in
// Password: Mansakha@2026
// Idempotent - safe to re-run. Usage: npm run seed:data-operators

require('dotenv').config();
const bcrypt = require('bcrypt');
const { pool } = require('./pgPool');

const PASSWORD = 'Mansakha@2026';
const DOMAIN = '@mansakha.gov.in';

function slugify(name) {
  return name.replace(/[^a-zA-Z0-9 ]/g, '').toLowerCase().replace(/\s+/g, '');
}

function pad(n, width = 3) {
  return String(n).padStart(width, '0');
}

async function main() {
  const roleRes = await pool.query("SELECT role_id FROM roles WHERE role_name = 'Data Operator'");
  if (!roleRes.rows[0]) throw new Error('Data Operator role not found');
  const roleId = roleRes.rows[0].role_id;

  const res = await pool.query(`
    SELECT o.official_id, o.full_name, o.email
    FROM officials o
    JOIN official_roles obr ON o.official_id = obr.official_id
    WHERE obr.role_id = $1 AND obr.revoked_at IS NULL
  `, [roleId]);

  const operators = res.rows;
  console.log(`Found ${operators.length} existing Data Operator accounts to update.`);

  // Sort with Dummy Data Operator first (DO-001 -> dataoperator001@mansakha.gov.in), then others
  operators.sort((a, b) => {
    if (a.full_name?.toLowerCase().includes('dummy')) return -1;
    if (b.full_name?.toLowerCase().includes('dummy')) return 1;
    return (a.full_name || '').localeCompare(b.full_name || '');
  });

  const passwordHash = await bcrypt.hash(PASSWORD, 12);

  // Clear existing official_identifier and assign temp emails on operators to avoid unique constraint collision during re-indexing
  await pool.query("UPDATE officials SET official_identifier = NULL, email = 'temp_' || official_id || '@mansakha.gov.in' WHERE official_id = ANY($1)", [operators.map(o => o.official_id)]);

  for (let i = 0; i < operators.length; i++) {
    const op = operators[i];
    const idx = pad(i + 1);
    const officialIdentifier = `DO-${idx}`;
    const nameSlug = slugify(op.full_name || `dataoperator${idx}`);
    const newEmail = `${nameSlug}${idx}${DOMAIN}`;

    await pool.query(`
      UPDATE officials
      SET password_hash = $1,
          must_change_password = false,
          staff_id = $2,
          official_identifier = $3,
          email = $4
      WHERE official_id = $5
    `, [passwordHash, officialIdentifier, officialIdentifier, newEmail, op.official_id]);

    console.log(`  Updated: ${op.full_name} → ${officialIdentifier} / ${newEmail}`);
  }

  console.log(`\nDone. Password: ${PASSWORD}`);
  process.exit(0);
}

main().catch((err) => { console.error('Seed failed:', err.message); process.exit(1); });
