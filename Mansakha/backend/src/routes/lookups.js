const express = require('express');
const { supabase } = require('../db/supabaseClient');
const { generalApiLimiter } = require('../middleware/rateLimiter');
const { ok, fail } = require('../services/responseEnvelope');

const router = express.Router();

// Public, unauthenticated reference data the Victim registration form needs
// before a session exists - none of it is sensitive (case type names,
// jurisdiction names, language names), unlike everything else in the API.
router.use(generalApiLimiter);

 //router.get('/case-types', async (req, res) => {
 // const { data, error } = await supabase.from('case_types').select('case_type_id, name').order('name');
  //if (error) return fail(res, 'Could not load case types', 500);
  //return ok(res, { caseTypes: data || [] });
//});

router.get('/case-types', async (req, res) => {
  const { data, error } = await supabase
    .from('case_types')
    .select('case_type_id, name')
    .order('name');

  if (error) {
    console.log('CASE TYPES SUPABASE ERROR:', error);

    return res.status(500).json({
      success: false,
      data: null,
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
  }

  return ok(res, { caseTypes: data || [] });
});

// District level only - the level victims register under (Build Prompt
// Section 6: a victim's jurisdiction_id anchors them to a district). Two
// plain queries instead of a PostgREST self-join embed on jurisdictions -
// the embed hint (jurisdictions!jurisdictions_parent_id_fkey) 404s because
// PostgREST's relationship cache doesn't resolve self-referencing FKs the
// same way it does cross-table ones; this sidesteps that entirely.
router.get('/jurisdictions', async (req, res) => {
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
