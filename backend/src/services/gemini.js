// Real call to the Gemini API free tier - Build Prompt Section 1 ("Use the Gemini
// API free tier ... stay within the free quota and don't attach a billing account").
// Plain fetch, no SDK dependency needed. Model name is env-configurable since Google
// periodically renames/retires model IDs and hardcoding one risks silently breaking
// later without an obvious cause.

// gemini-2.0-flash was retired (real 404 from the live API, not a
// hypothetical). gemini-flash-latest (Google's always-current alias) 503'd
// under this app's actual JSON-mode request shape during testing, likely
// because it currently points at a newer, higher-demand preview model;
// gemini-2.5-flash is a GA-stable model that handled the same request
// reliably, so that's the default instead.
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

const VALID_INTERVENTION_NAMES = ['Counselling', 'Medical', 'Witness Protection', 'Relocation', 'Financial Assistance', 'Legal Aid', 'Rehabilitation'];

const PROMPT_INSTRUCTIONS = `You are analyzing a mental-health check-in response from a
victim of an atrocity under India's SC/ST (Prevention of Atrocities) Act, as part of a
distress-monitoring system. Read the response and return ONLY a JSON object (no markdown
fences, no extra text) with exactly these fields:
{
  "sentiment": <number from -1 to 1, where -1 is very positive/safe and 1 is very
    negative/distressed - i.e. ALREADY INVERTED so higher means more distress>,
  "emotion": <number from 0 to 1, weighted toward fear and sadness specifically,
    where 1 is strong fear/sadness present>,
  "reason": "<one short sentence naming which words or phrases in the response drove
    this assessment - this is shown to a counsellor as an explanation, not just a score>",
  "suggestedIntervention": "<if this response suggests a specific kind of help would be
    appropriate, EXACTLY one of: Counselling, Medical, Witness Protection, Relocation,
    Financial Assistance, Legal Aid, Rehabilitation. If nothing specific stands out, use
    null. This is a suggestion a human Counsellor reviews and can override - never treat
    it as a decision.>"
}`;

async function callGemini(text) {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is not set');
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${process.env.GEMINI_API_KEY}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: `${PROMPT_INSTRUCTIONS}\n\nCheck-in response:\n"""${text}"""` }] }],
      generationConfig: { responseMimeType: 'application/json' },
    }),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    throw new Error(`Gemini API error (${res.status}): ${errBody}`);
  }

  const json = await res.json();
  const rawText = json?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!rawText) throw new Error('Gemini returned no content');

  let parsed;
  try {
    parsed = JSON.parse(rawText);
  } catch (err) {
    throw new Error(`Gemini returned non-JSON content: ${rawText}`);
  }

  if (typeof parsed.sentiment !== 'number' || typeof parsed.emotion !== 'number') {
    throw new Error(`Gemini response missing required fields: ${rawText}`);
  }

  return {
    sentimentRaw: Math.max(-1, Math.min(1, parsed.sentiment)),
    emotion: Math.max(0, Math.min(1, parsed.emotion)),
    reason: typeof parsed.reason === 'string' ? parsed.reason : null,
    suggestedInterventionName: VALID_INTERVENTION_NAMES.includes(parsed.suggestedIntervention) ? parsed.suggestedIntervention : null,
  };
}

module.exports = { callGemini };
