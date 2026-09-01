const express = require('express');
const { analyzeInteraction } = require('../ai');
const { requireInternalSecret } = require('../../core/middleware/requireInternalSecret');
const { ok, fail } = require('../../core/services/responseEnvelope');

const router = express.Router();

// POST /api/ai/analyze-interaction - Build Prompt Section 7: "internal, called by
// the backend only - never directly by a client". The checkin flow (user/routes/user.routes.js)
// calls ai/ai.js's analyzeInteraction() directly in-process; this HTTP route
// exists for contract-completeness (Section 7 lists it explicitly) and as the seam
// a future separate AI service would call, guarded by a shared secret instead of a
// user JWT since no human account should ever be able to reach it.
router.post('/analyze-interaction', requireInternalSecret, async (req, res) => {
  const { userId, text } = req.body;
  if (!userId || !text) return fail(res, 'userId and text are required', 400);

  try {
    const result = await analyzeInteraction(userId, text);
    return ok(res, result);
  } catch (err) {
    return fail(res, `AI analysis failed: ${err.message}`, 502);
  }
});

module.exports = router;
