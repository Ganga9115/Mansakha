const express = require('express');
const { analyzeInteraction } = require('../ai');
const { analyzeCallTranscript } = require('../ollama');
const { requireInternalSecret } = require('../../core/middleware/requireInternalSecret');
const { ok, fail } = require('../../core/services/responseEnvelope');
const { recordInteraction, recordOllamaDistressScore, PipelineError } = require('../../core/services/interactionPipeline');
const { applyStressResponse } = require('../../core/services/stressResponse');
const { notifyDisengagement } = require('../../core/services/dispatchWorker');
const { pool } = require('../../core/db/pgPool');

const router = express.Router();

// POST /api/ai/analyze-interaction - Build Prompt Section 7: "internal, called by
// the backend only - never directly by a client". The checkin flow (user/routes/user.routes.js)
// calls ai/ai.js's analyzeInteraction() directly in-process; this HTTP route
// exists for contract-completeness (Section 7 lists it explicitly) and as the seam
// a future separate AI service would call, guarded by a shared secret instead of a
// user JWT since no human account should ever be able to reach it.
router.post('/analyze-interaction', requireInternalSecret, async (req, res) => {
  const { userId, text, audioBase64 } = req.body;
  if (!userId || (!text && !audioBase64)) {
    return fail(res, 'userId and either text or audioBase64 are required', 400);
  }

  try {
    const result = await analyzeInteraction(userId, text || '', { audioBase64 });
    return ok(res, result);
  } catch (err) {
    return fail(res, `AI analysis failed: ${err.message}`, 502);
  }
});

// Feature improvement point 2 - real IVRS calling is integrated separately
// (this project's own Exotel credentials are still the disclosed non-
// functional stub in dispatchWorker.js's placeIvrsCall), but WHATEVER
// system actually places those calls needs somewhere to report the outcome
// back to. Internal-secret-gated for the same reason /analyze-interaction
// above is - no human account, only a server-to-server caller, should ever
// reach this.
//
// "If the victim does not answer... a human counsellor should be
// automatically assigned" and "if the victim answers but disconnects within
// a very short period (~5s), the system should also automatically assign a
// human counsellor" - both routed through the same notifyDisengagement()
// the 7-day-inactivity scan uses (dispatchWorker.js), so a short/unanswered
// call gets exactly the same "assign + notify" treatment as prolonged
// inactivity, just triggered immediately instead of on the next scan tick.
router.post('/ivrs-call-result', requireInternalSecret, async (req, res) => {
  const { userId, answered, durationSeconds, transcriptText, audioBase64 } = req.body;
  if (!userId || typeof answered !== 'boolean') {
    return fail(res, 'userId and answered (boolean) are required', 400);
  }

  const { rows: userRows } = await pool.query('select jurisdiction_id from users where user_id = $1', [userId]);
  if (userRows.length === 0) return fail(res, 'User not found', 404);
  const { jurisdiction_id: jurisdictionId } = userRows[0];

  const wasTooShort = answered && typeof durationSeconds === 'number' && durationSeconds < 5;
  let disengagement = null;
  if (!answered || wasTooShort) {
    try {
      disengagement = await notifyDisengagement(userId, jurisdictionId);
    } catch (err) {
      console.error('ivrs-call-result: disengagement notify failed:', err.message);
    }
  }

  let scored = false;
  let scoreValue = null;
  let riskLevel = null;
  let effectiveTranscript = transcriptText;

  // If audioBase64 is provided, run full multimodal analysis (Voice Stress + STT)
  if (audioBase64 || (typeof effectiveTranscript === 'string' && effectiveTranscript.trim())) {
    try {
      const fullAnalysis = await analyzeInteraction(userId, effectiveTranscript || '', { audioBase64 });
      const finalTranscript = fullAnalysis.transcript || effectiveTranscript || 'IVRS audio recording';
      const { interactionId } = await recordInteraction({ userId, channelName: 'IVRS', transcriptText: finalTranscript });
      
      const analysisPayload = {
        score: fullAnalysis.scoreValue,
        sentiment: fullAnalysis.sentimentRaw,
        emotion: fullAnalysis.emotion,
        voiceStress: fullAnalysis.voiceStressScore || 0,
        reason: fullAnalysis.reason,
        suggestedIntervention: fullAnalysis.suggestedInterventionTypeId,
      };

      const result = await recordOllamaDistressScore(userId, interactionId, analysisPayload, 'multimodal-ivrs-v2');
      await applyStressResponse(userId, result.scoreId, result.riskLevel);
      scored = true;
      scoreValue = fullAnalysis.scoreValue;
      riskLevel = result.riskLevel;
    } catch (err) {
      if (!(err instanceof PipelineError)) console.error('ivrs-call-result: transcript scoring failed:', err.message);
    }
  }

  return ok(res, {
    disengagementNotified: disengagement?.notified || false,
    counsellorId: disengagement?.counsellorId || null,
    scored,
    scoreValue,
    riskLevel,
  });
});

module.exports = router;
