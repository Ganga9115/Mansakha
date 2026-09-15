// One-time fix: set opted_for_manual_counsellor = true for all users
// who already have an assigned_counsellor_id (seeded without the flag).
require('dotenv').config();
const { pool } = require('./src/core/db/pgPool');

async function fix() {
  const { rows } = await pool.query(`
    UPDATE users
    SET opted_for_manual_counsellor = true
    WHERE assigned_counsellor_id IS NOT NULL
      AND opted_for_manual_counsellor = false
    RETURNING user_id
  `);
  console.log(`Fixed ${rows.length} users — set opted_for_manual_counsellor = true`);
  await pool.end();
}

fix().catch(err => { console.error(err); process.exit(1); });
