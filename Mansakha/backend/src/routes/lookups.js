const express = require('express');
const { pool } = require('../core/db/pgPool');
const { generalApiLimiter } = require('../core/middleware/rateLimiter');
const { ok } = require('../core/services/responseEnvelope');

const router = express.Router();

// Public, unauthenticated reference data the User Login screen needs
// before a session exists - none of it is sensitive (case type names,
// jurisdiction names, language names), unlike everything else in the API.
router.use(generalApiLimiter);

router.get('/case-types', async (req, res) => {
  // Raw pg (not Supabase REST) - this is the User Login screen's own
  // dropdown, hit on every single app/site load before any session exists,
  // so a PostgREST round trip's ~500-650ms is felt on literally every visit
  // (confirmed live elsewhere this session; same fix as verifyToken.js/
  // districtAdmin.routes.js).
  const { rows } = await pool.query('select case_type_id, name from case_types where deleted_at is null order by name');
  return ok(res, { caseTypes: rows });
});

// Feature Catalog Section 1.1: the Login screen's State dropdown
// (?level=state) and District dropdown (?level=district&parentId=<stateId>,
// refetched whenever the State selection changes). With no query params at
// all, falls back to the original full-district-list-with-resolved-stateName
// shape for any caller not passing the new filters.
//
// Two plain queries instead of a PostgREST self-join embed on jurisdictions -
// the embed hint (jurisdictions!jurisdictions_parent_id_fkey) 404s because
// PostgREST's relationship cache doesn't resolve self-referencing FKs the
// same way it does cross-table ones; this sidesteps that entirely.
router.get('/jurisdictions', async (req, res) => {
  const { level, parentId } = req.query;

  // Raw pg (not Supabase REST) throughout this route - same Login-screen
  // rationale as /case-types above (State/District dropdowns, refetched on
  // every State selection change).
  if (level === 'state' || level === 'national') {
    const { rows } = await pool.query('select jurisdiction_id, name from jurisdictions where level = $1 order by name', [level]);
    return ok(res, { jurisdictions: rows.map((j) => ({ jurisdictionId: j.jurisdiction_id, name: j.name })) });
  }

  if (level === 'district') {
    const { rows } = parentId
      ? await pool.query('select jurisdiction_id, name, parent_id from jurisdictions where level = $1 and parent_id = $2 order by name', ['district', parentId])
      : await pool.query('select jurisdiction_id, name, parent_id from jurisdictions where level = $1 order by name', ['district']);
    return ok(res, { jurisdictions: rows.map((j) => ({ jurisdictionId: j.jurisdiction_id, name: j.name, parentId: j.parent_id })) });
  }

  // Two plain queries instead of a self-join, same PostgREST self-referencing-FK
  // reason as the original comment above documented.
  const { rows: districts } = await pool.query('select jurisdiction_id, name, parent_id from jurisdictions where level = $1 order by name', ['district']);
  const { rows: states } = await pool.query('select jurisdiction_id, name from jurisdictions where level = $1', ['state']);
  const stateNameById = new Map(states.map((s) => [s.jurisdiction_id, s.name]));

  const jurisdictions = districts.map((j) => ({
    jurisdictionId: j.jurisdiction_id,
    name: j.name,
    stateName: stateNameById.get(j.parent_id) || null,
  }));
  return ok(res, { jurisdictions });
});

router.get('/languages', async (req, res) => {
  // Same Login-screen raw-pg rationale as the two routes above - not caught
  // by a plain `supabase.from(` grep (the call was split across lines), but
  // the exact same public login-screen dropdown pattern.
  const { rows } = await pool.query('select language_id, code, name from languages where deleted_at is null order by name');
  return ok(res, { languages: rows });
});

module.exports = router;
