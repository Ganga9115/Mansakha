const express = require('express');
const { supabase } = require('../db/supabaseClient');
const { verifyToken } = require('../middleware/verifyToken');
const { ok, fail } = require('../services/responseEnvelope');

const router = express.Router();

// The Staff Login surface covers Administration + Counsellor + Ministry with one
// email+password check (see routes/auth.staff.js, auth.ministry.js); the frontend
// needs to know WHICH role/jurisdiction actually came back before it can pick the
// right dashboard shell (Build Prompt Section 3/4.5) - this is that lookup.
router.get('/', verifyToken, (req, res) => {
  if (req.auth.type === 'victim') {
    return ok(res, { type: 'victim', victimId: req.auth.victimId });
  }
  return ok(res, {
    type: 'official',
    officialId: req.auth.officialId,
    mustChangePassword: req.auth.mustChangePassword,
    roles: req.auth.roles,
  });
});

// Frontend-pending (see services/dispatchWorker.js's header comment) - real
// device token registration needs expo-notifications wired on native
// platforms, not done this pass since web (this session's only reliably
// testable platform) isn't supported by that package at all. Endpoint is
// ready for whenever that lands.
router.patch('/push-token', verifyToken, async (req, res) => {
  const { token } = req.body;
  if (!token) return fail(res, 'token is required', 400);

  const isVictim = req.auth.type === 'victim';
  const table = isVictim ? 'victims' : 'officials';
  const idColumn = isVictim ? 'victim_id' : 'official_id';
  const id = isVictim ? req.auth.victimId : req.auth.officialId;

  const { error } = await supabase.from(table).update({ expo_push_token: token }).eq(idColumn, id);
  if (error) return fail(res, `Could not register push token: ${error.message}`, 500);

  return ok(res, null, 'Push token registered');
});

module.exports = router;
