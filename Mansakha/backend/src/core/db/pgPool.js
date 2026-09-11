const { Pool } = require('pg');

// Direct Postgres access (separate from supabaseClient.js's PostgREST client) -
// needed here because supabase-js has no multi-statement transaction API, and
// several writes below touch two tables that must succeed or fail together
// (e.g. users + user_identity). Same connection details as the migration
// scripts in this folder; kept as separate fields (not one DATABASE_URL)
// because the password contains "@".
if (!process.env.SUPABASE_DB_HOST || !process.env.SUPABASE_DB_PASSWORD) {
  throw new Error('SUPABASE_DB_HOST..SUPABASE_DB_PASSWORD must be set in .env');
}

const pool = new Pool({
  host: process.env.SUPABASE_DB_HOST,
  port: process.env.SUPABASE_DB_PORT,
  database: process.env.SUPABASE_DB_NAME,
  user: process.env.SUPABASE_DB_USER,
  password: process.env.SUPABASE_DB_PASSWORD,
  ssl: { rejectUnauthorized: false },
  max: 50,
});

// Runs `fn` inside a single BEGIN/COMMIT, rolling back on any thrown error -
// callers get real atomicity across multiple statements/tables instead of
// the partial-write risk of several independent supabase-js calls.
async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { pool, withTransaction };
