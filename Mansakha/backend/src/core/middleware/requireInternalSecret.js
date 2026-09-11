const { fail } = require('../services/responseEnvelope');

// POST /api/ai/analyze-interaction is "internal, called by the backend only - never
// directly by a client" per Build Prompt Section 7. A user JWT doesn't model that
// correctly (no human should be able to call this at all), so this checks a
// server-to-server shared secret instead.
function requireInternalSecret(req, res, next) {
  const provided = req.headers['x-internal-secret'];
  if (!provided || provided !== process.env.INTERNAL_API_SECRET) {
    return fail(res, 'Forbidden', 403);
  }
  next();
}

module.exports = { requireInternalSecret };
