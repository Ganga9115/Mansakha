const express = require('express');
const { supabase } = require('../core/db/supabaseClient');
const { generalApiLimiter } = require('../core/middleware/rateLimiter');
const { ok, fail } = require('../core/services/responseEnvelope');

const router = express.Router();

// Public, unauthenticated reference data the User Login screen needs
// before a session exists - none of it is sensitive (case type names,
// jurisdiction names, language names), unlike everything else in the API.
router.use(generalApiLimiter);

router.get('/case-types', async (req, res) => {
  const { data, error } = await supabase.from('case_types').select('case_type_id, name').is('deleted_at', null).order('name');
  if (error) return fail(res, 'Could not load case types', 500);
  return ok(res, { caseTypes: data || [] });
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

  if (level === 'state' || level === 'national') {
    const { data, error } = await supabase.from('jurisdictions').select('jurisdiction_id, name').eq('level', level).order('name');
    if (error) return fail(res, 'Could not load jurisdictions', 500);
    return ok(res, { jurisdictions: (data || []).map((j) => ({ jurisdictionId: j.jurisdiction_id, name: j.name })) });
  }

  if (level === 'district') {
    let query = supabase.from('jurisdictions').select('jurisdiction_id, name, parent_id').eq('level', 'district').order('name');
    if (parentId) query = query.eq('parent_id', parentId);
    const { data, error } = await query;
    if (error) return fail(res, 'Could not load jurisdictions', 500);
    return ok(res, { jurisdictions: (data || []).map((j) => ({ jurisdictionId: j.jurisdiction_id, name: j.name, parentId: j.parent_id })) });
  }

  const { data: districts, error: districtError } = await supabase
    .from('jurisdictions')
    .select('jurisdiction_id, name, parent_id')
    .eq('level', 'district')
    .order('name');
  if (districtError) return fail(res, 'Could not load jurisdictions', 500);

  const { data: states, error: stateError } = await supabase.from('jurisdictions').select('jurisdiction_id, name').eq('level', 'state');
  if (stateError) return fail(res, 'Could not load jurisdictions', 500);
  const stateNameById = new Map((states || []).map((s) => [s.jurisdiction_id, s.name]));

  const jurisdictions = (districts || []).map((j) => ({
    jurisdictionId: j.jurisdiction_id,
    name: j.name,
    stateName: stateNameById.get(j.parent_id) || null,
  }));
  return ok(res, { jurisdictions });
});

router.get('/languages', async (req, res) => {
  const { data, error } = await supabase
    .from('languages')
    .select('language_id, code, name')
    .is('deleted_at', null)
    .order('name');
  if (error) return fail(res, 'Could not load languages', 500);
  return ok(res, { languages: data || [] });
});

module.exports = router;
