const express = require('express');
const { analyzeInteraction } = require('../services/ai');
const { requireInternalSecret } = require('../middleware/requireInternalSecret');
const { ok, fail } = require('../services/responseEnvelope');

const router = express.Router();

// POST /api/ai/analyze-interaction - Build Prompt Section 7: "internal, called by
// the backend only - never directly by a client". The checkin flow (routes/victim.js)
// calls services/ai.js's analyzeInteraction() directly in-process; this HTTP route
// exists for contract-completeness (Section 7 lists it explicitly) and as the seam
// a future separate AI service would call, guarded by a shared secret instead of a
// user JWT since no human account should ever be able to reach it.
router.post('/analyze-interaction', requireInternalSecret, async (req, res) => {
  const { victimId, text } = req.body;
  if (!victimId || !text) return fail(res, 'victimId and text are required', 400);

  try {
    const result = await analyzeInteraction(victimId, text);
    return ok(res, result);
  } catch (err) {
    return fail(res, `AI analysis failed: ${err.message}`, 502);
  }
});

module.exports = router;
