const { pool } = require('../db/pgPool');

// migration_045 - Rehabilitation is a fact about the PERSON, not any one of
// their cases (per explicit product decision: "rehabilitation is the same
// for multiple NHaa cases", unlike compensation, which stays genuinely
// per-case). Every read/write here resolves to the ANCHOR user_id first
// (coalesce(linked_to_user_id, user_id)) and operates on
// rehabilitation_status, never on an individual docket's own row - so
// opting in (or declining, or being closed out) through ANY one of a
// person's cases is visible from every other case of theirs too.

async function resolveAnchorId(userId) {
  const { rows } = await pool.query('select coalesce(linked_to_user_id, user_id) as anchor_id from users where user_id = $1', [userId]);
  if (!rows[0]) throw new Error('Case not found');
  return rows[0].anchor_id;
}

async function getRehabilitationStatus(userId) {
  const anchorId = await resolveAnchorId(userId);
  const { rows } = await pool.query(
    `select rs.opted_in_at, rs.declined_at, rs.closed_at, rs.provider_id, rp.name as provider_name, rp.provider_type
     from rehabilitation_status rs
     left join rehabilitation_providers rp on rp.provider_id = rs.provider_id
     where rs.anchor_user_id = $1`,
    [anchorId]
  );
  const r = rows[0];
  return {
    anchorId,
    optedInAt: r?.opted_in_at || null,
    declinedAt: r?.declined_at || null,
    closedAt: r?.closed_at || null,
    providerId: r?.provider_id || null,
    providerName: r?.provider_name || null,
    providerType: r?.provider_type || null,
  };
}

// "Resolved" = the person's rehabilitation question has a final answer that
// will never need to change again - declined outright, or opted in AND
// since closed by the Rehabilitation Officer. This is exactly the
// rehabilitation half of caseCompletion.js's own combined condition.
function isRehabilitationResolved(status) {
  if (!status) return true; // never asked (case never reached Compensation) - nothing blocking
  if (status.declinedAt) return true;
  if (status.optedInAt && status.closedAt) return true;
  return false;
}

async function optIn(userId, providerId) {
  const anchorId = await resolveAnchorId(userId);
  await pool.query(
    `insert into rehabilitation_status (anchor_user_id, opted_in_at, provider_id, updated_at)
     values ($1, now(), $2, now())
     on conflict (anchor_user_id) do update set opted_in_at = now(), provider_id = $2, updated_at = now()
     where rehabilitation_status.opted_in_at is null and rehabilitation_status.declined_at is null`,
    [anchorId, providerId]
  );
  return anchorId;
}

async function decline(userId) {
  const anchorId = await resolveAnchorId(userId);
  await pool.query(
    `insert into rehabilitation_status (anchor_user_id, declined_at, updated_at)
     values ($1, now(), now())
     on conflict (anchor_user_id) do update set declined_at = now(), updated_at = now()
     where rehabilitation_status.opted_in_at is null and rehabilitation_status.declined_at is null`,
    [anchorId]
  );
  return anchorId;
}

// The Rehabilitation Officer marking the person's rehabilitation case
// closed - the other half of "resolved" alongside decline.
async function closeOut(userId, officialId) {
  const anchorId = await resolveAnchorId(userId);
  await pool.query(
    `update rehabilitation_status set closed_at = now(), closed_by_official_id = $2, updated_at = now()
     where anchor_user_id = $1 and opted_in_at is not null and closed_at is null`,
    [anchorId, officialId]
  );
  return anchorId;
}

module.exports = { resolveAnchorId, getRehabilitationStatus, isRehabilitationResolved, optIn, decline, closeOut };
