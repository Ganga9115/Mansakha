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

// Feature Catalog Section 1.3 "AI Chat" - one combined Gemini call per chat
// message (not two) to protect the shared 20/day free-tier quota: this
// prompt asks for the same distress-scoring fields as PROMPT_INSTRUCTIONS
// above PLUS a conversational `reply`, in one JSON response. Kept as a
// parallel prompt/function rather than modifying PROMPT_INSTRUCTIONS/
// callGemini in place - /checkin's live path stays byte-for-byte unaffected.
const CHAT_PROMPT_INSTRUCTIONS = `You are "Mansakha", a supportive chat companion inside a
distress-monitoring app for victims of an atrocity under India's SC/ST (Prevention of
Atrocities) Act. The victim just sent you one chat message. Do two things at once:
(1) assess this message for distress signals, exactly as a clinical intake screening
would, and (2) write a short supportive reply to show them in the chat.

Read the message and return ONLY a JSON object (no markdown fences, no extra text) with
exactly these fields:
{
  "sentiment": <number from -1 to 1, where -1 is very positive/safe and 1 is very
    negative/distressed - i.e. ALREADY INVERTED so higher means more distress>,
  "emotion": <number from 0 to 1, weighted toward fear and sadness specifically,
    where 1 is strong fear/sadness present>,
  "reason": "<one short sentence naming which words or phrases in the message drove
    this assessment - shown to a counsellor as an explanation, not just a score>",
  "suggestedIntervention": "<EXACTLY one of: Counselling, Medical, Witness Protection,
    Relocation, Financial Assistance, Legal Aid, Rehabilitation - or null if nothing
    specific stands out. A suggestion a human Counsellor reviews and can override -
    never a decision.>",
  "reply": "<your supportive chat reply to the victim, 2-4 short sentences, plain
    language. You are NOT a licensed therapist or counsellor and must never claim or
    imply that you are one. Never give legal advice (about their case, filing, or
    prosecution) or medical advice (diagnoses, medication). You may listen, validate
    their feelings, and gently encourage them. If this message reads as high distress,
    gently mention real human help in the same reply: the NHAA Helpline (14566,
    available 24/7) and that they can reach their Counsellor through the Support
    section of this app. Never sound alarming, clinical, or scripted.>"
}`;

async function callGeminiChat(text) {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is not set');
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${process.env.GEMINI_API_KEY}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: `${CHAT_PROMPT_INSTRUCTIONS}\n\nChat message:\n"""${text}"""` }] }],
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

  if (typeof parsed.sentiment !== 'number' || typeof parsed.emotion !== 'number' || typeof parsed.reply !== 'string' || !parsed.reply.trim()) {
    // Unlike reason/suggestedIntervention (nullable), a missing/empty reply
    // fails the whole call - it's the one thing this endpoint can't function
    // without, same failure mode as a fully malformed response.
    throw new Error(`Gemini chat response missing required fields: ${rawText}`);
  }

  return {
    sentimentRaw: Math.max(-1, Math.min(1, parsed.sentiment)),
    emotion: Math.max(0, Math.min(1, parsed.emotion)),
    reason: typeof parsed.reason === 'string' ? parsed.reason : null,
    suggestedInterventionName: VALID_INTERVENTION_NAMES.includes(parsed.suggestedIntervention) ? parsed.suggestedIntervention : null,
    reply: parsed.reply.trim(),
  };
}

// Plain-text (not JSON) Gemini calls for two other Feature Catalog prompts -
// both just need a short piece of written text back, not structured
// extraction, so they skip the JSON-mode plumbing above entirely.
async function callGeminiPlainText(promptText) {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is not set');
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${process.env.GEMINI_API_KEY}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: promptText }] }] }),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    throw new Error(`Gemini API error (${res.status}): ${errBody}`);
  }

  const json = await res.json();
  const rawText = json?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!rawText || !rawText.trim()) throw new Error('Gemini returned no content');
  return rawText.trim();
}

// Feature Catalog Section 1.5 "High" tier - a short, context-aware proactive
// check-in message, delivered via push/SMS by the dispatch worker. Kept
// simple per the spec's own "keep the prompt simple" instruction.
async function generateProactiveContactMessage(recentTrendSummary) {
  const prompt = `You are "Mansakha", a supportive check-in companion for a victim of an
atrocity under India's SC/ST (Prevention of Atrocities) Act whose recent well-being
check-ins show rising distress. Write ONE short, warm, non-alarming proactive
check-in message (2-3 sentences, plain language) to send them as a push notification.
Do not diagnose, do not give legal or medical advice, do not claim to be a therapist.
Context on their recent trend: ${recentTrendSummary}. Return ONLY the message text,
no quotes, no markdown, no preamble.`;
  return callGeminiPlainText(prompt);
}

// Feature Catalog Section 2.3 "Case notes - AI / Manual" auto-draft. Summarizes
// one check-in's transcript into a short case-note draft a Counsellor reviews
// and can edit before it's final (routes/counsellor.js inserts it as a normal
// case_notes row with authored_by: 'ai' - never auto-finalized).
async function generateCaseNoteDraft(transcriptText) {
  const prompt = `You are drafting a brief case note for a Counsellor working with a
victim of an atrocity under India's SC/ST (Prevention of Atrocities) Act, based on
their latest check-in. Write a short, factual, professional summary (2-4 sentences)
of what the victim reported - no diagnosis, no clinical labels, no legal conclusions,
just what was said and any notable change from a typical response. This draft will be
reviewed and can be edited by the Counsellor before being treated as final.

Check-in transcript:
"""${transcriptText}"""

Return ONLY the note text, no quotes, no markdown, no preamble.`;
  return callGeminiPlainText(prompt);
}

module.exports = { callGemini, callGeminiChat, generateProactiveContactMessage, generateCaseNoteDraft };
