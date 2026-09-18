// Local, on-device conversational AI for the Check-in screen - talks directly
// to a locally-running Ollama instance, the same way
// mansakha_local_ai_two_modes_fixed_voice.html does (plain fetch to
// /api/tags and /api/chat, no SDK). Runs entirely on the user's own
// device/network; this never reaches Anthropic, Google, or Mansakha's own
// backend - the backend only sees the finished transcript + analysis
// (see useCheckin in services/hooks.js).

const OLLAMA_BASE_URL = process.env.EXPO_PUBLIC_OLLAMA_BASE_URL || 'http://127.0.0.1:11434';
const OLLAMA_MODEL = process.env.EXPO_PUBLIC_OLLAMA_MODEL || 'gemma3:4b';

const TAGS_URL = `${OLLAMA_BASE_URL}/api/tags`;
const CHAT_URL = `${OLLAMA_BASE_URL}/api/chat`;

// Deterministic safety net for suicidal/self-harm language - confirmed live
// that the system prompt's own "redirect to the helpline" rule is NOT
// reliable enough on its own: a small local model (gemma3:4b) responded to
// three repeated "I want to die" messages with pure validation ("I'm here
// to listen", "offering a quiet space") and never once surfaced the
// helpline. Mirrors the backend's own HIGH_RISK_HELP_POINTER pattern in
// ai/ai.js's analyzeChatMessage ("don't rely solely on the model
// remembering") - here applied client-side, checking the user's own words
// directly instead of trusting the model's reply to have handled it.
const HELPLINE_MESSAGE = "Please call the NHAA Helpline at 14566 right now - they're available 24/7 and can help immediately. You can also reach your counsellor through this app.";

const SELF_HARM_PHRASES = [
  'want to die', 'wanted to die', 'wanna die', 'going to die', 'i will die',
  'kill myself', 'kill me',
  'end my life', 'end it all', 'ending my life',
  'suicide', 'suicidal',
  'no reason to live', 'nothing to live for', 'not worth living',
  'better off dead',
  'hurt myself', 'harm myself', 'self-harm', 'self harm', 'cutting myself',
  "can't go on", 'cant go on',
  "don't want to live", 'dont want to live', "don't want to be alive", 'dont want to be alive',
];
const SELF_HARM_RISK_PATTERN = new RegExp(
  SELF_HARM_PHRASES.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'),
  'i'
);

function containsSelfHarmRisk(text) {
  return SELF_HARM_RISK_PATTERN.test(text || '');
}

// Appends the helpline pointer only when both true: the user's own message
// actually triggered the risk pattern, AND the model's reply doesn't
// already mention 14566 (some replies do get it right - never double it up).
function ensureHelplineIfAtRisk(userText, aiReply) {
  if (!containsSelfHarmRisk(userText)) return aiReply;
  if ((aiReply || '').includes('14566')) return aiReply;
  return `${aiReply}\n\n${HELPLINE_MESSAGE}`;
}

const COMPANION_SYSTEM_PROMPT = `You are Mansakha, a calm, soft, and deeply empathetic conversational companion for people navigating a difficult situation under India's SC/ST Act. Never label them or refer to them as a "victim" - be extremely sensitive, comforting, and supportive.
Rule 0 (overrides every other rule): The instant they express any suicidal thought, self-harm intent, wish to die, or a threat to their own life - however indirect - immediately and clearly say: "Please call the NHAA Helpline at 14566 right now - they're available 24/7 and can help immediately. You can also reach your counsellor through this app." Say this plainly, not just a gentle mention buried in reassurance.
Rule 1: NEVER interrogate the user. Do not ask them to elaborate on every single thing they say. Do not ask more than ONE question per response. Often, it is better to ask NO questions and simply validate their feelings.
Rule 2: Advise like a real counsellor, not just a listener - when they describe being stuck in a bad thought spiral, gently point them toward one small, concrete way forward (a grounding step, a reason to hold on, someone to reach out to) rather than only reflecting their feelings back.
Rule 3: Keep replies short (2-3 sentences max) and natural. Do not repeat "I am there for you", "I'm here for you", "I'm here to listen", or close variants across responses - say something like this at most once, if at all, and vary how you express care every time.
Rule 4: Do not diagnose conditions, assign risk levels, or claim to be a doctor, lawyer, or police officer.
Rule 5: Never ask them to describe or re-explain what happened, to them or to anyone they've lost - they've likely already repeated it to police, doctors, and lawyers.
Rule 6: If they ask something direct and practical ("what should I do about the case"), answer it plainly - do not deflect a real question into pure emotional reflection, that reads as not listening.
Rule 7: If they're carrying more than one distinct source of pain at once (e.g. grief for someone lost, alongside their own safety or recovery), acknowledge each specifically when relevant rather than one vague "everything you're going through" - and follow whichever one they bring up, don't redirect to the other.`;

const OPENING_GREETING = "Hello. I'm here to listen. Take your time. How are you feeling today?";

// The first TWO questions of every check-in are identical for every user,
// regardless of case type - only question 3 onward adapts (see
// generateInteractiveQuestion's caseType param below). Both are ordinary,
// everyday-life questions with no reference to any case or incident, so
// nobody's very first check-in question ever singles them out.
const SECOND_QUESTION = {
  text: "And how has your sleep and energy been lately?",
  type: 'single',
  options: ['Sleeping fine, feeling okay', 'A little restless some nights', 'Struggling to rest properly', 'Sleeping a lot more than usual'],
};

const VALID_INTERVENTIONS = ['Counselling', 'Medical', 'Witness Protection', 'Relocation', 'Financial Assistance', 'Legal Aid', 'Rehabilitation'];

const ANALYSIS_SYSTEM_PROMPT = `You are the distress-analysis step of Mansakha, a check-in companion for users who are victims of an atrocity under India's SC/ST (Prevention of Atrocities) Act. You will be given a full check-in conversation transcript. Read it and return ONLY a JSON object (no markdown fences, no extra text) with exactly these fields:
{
  "sentiment": <number from -1 to 1, where -1 is very positive/safe and 1 is very negative/distressed - i.e. ALREADY INVERTED so higher means more distress>,
  "emotion": <number from 0 to 1, weighted toward fear and sadness specifically, where 1 is strong fear/sadness present>,
  "reason": "<one short sentence naming which words or phrases drove this assessment - shown to a counsellor as an explanation>",
  "suggestedIntervention": "<if this conversation suggests a specific kind of help would be appropriate, EXACTLY one of: Counselling, Medical, Witness Protection, Relocation, Financial Assistance, Legal Aid, Rehabilitation. If nothing specific stands out, use null.>",
  "summary": "<a short, factual, professional 2-4 sentence summary of what the person reported during this check-in, written for a Counsellor's case notes - no diagnosis, no clinical labels, no legal conclusions>"
}`;

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

// Mirrors local_ai.html's loadModels() connectivity check - lets the screen
// show "Local AI connected" / "Cannot connect to Ollama" instead of only
// discovering it's unreachable on the first real message.
async function checkOllamaConnection() {
  try {
    const res = await fetch(TAGS_URL);
    if (!res.ok) throw new Error(String(res.status));
    const data = await res.json();
    const models = (data.models || []).map((m) => m.name);
    return { connected: true, models };
  } catch (err) {
    return { connected: false, models: [] };
  }
}

// `conversation`: [{ role: 'user'|'assistant', content }] - no system prompt
// included, this function prepends it. Returns the assistant's reply text.
async function sendCompanionMessage(conversation, model = OLLAMA_MODEL) {
  const res = await fetch(CHAT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      stream: false,
      messages: [{ role: 'system', content: COMPANION_SYSTEM_PROMPT }, ...conversation],
      options: { temperature: 0.5 },
    }),
  });
  if (!res.ok) throw new Error(await res.text().catch(() => `Ollama error ${res.status}`));
  const data = await res.json();
  const reply = data?.message?.content?.trim();
  if (!reply) throw new Error('Ollama returned an empty response');
  return reply;
}

// One analysis call over the WHOLE conversation (not per-message, unlike the
// backend's old per-message Gemini calls) - this is the "distress level and
// summary" the app submits to /api/user/checkin, which the backend runs
// through its existing computeDistressScore/alerts/case-note pipeline
// (see services/ai.js's analyzeInteractionFromClientAi on the backend).
async function analyzeConversation(conversation, model = OLLAMA_MODEL) {
  const transcript = conversation
    .map((m) => `${m.role === 'user' ? 'Person' : 'Mansakha'}: ${m.content}`)
    .join('\n');

  try {
    const res = await fetch(CHAT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        stream: false,
        format: 'json',
        messages: [
          { role: 'system', content: ANALYSIS_SYSTEM_PROMPT },
          { role: 'user', content: `Check-in conversation transcript:\n"""${transcript}"""` },
        ],
        options: { temperature: 0.2 },
      }),
    });
    if (res.ok) {
      const data = await res.json();
      const raw = data?.message?.content;
      if (raw) {
        let parsed = JSON.parse(raw);
        if (typeof parsed.sentiment === 'number' && typeof parsed.emotion === 'number' && typeof parsed.summary === 'string' && parsed.summary.trim()) {
          return {
            sentiment: clamp(parsed.sentiment, -1, 1),
            emotion: clamp(parsed.emotion, 0, 1),
            reason: typeof parsed.reason === 'string' ? parsed.reason : null,
            suggestedIntervention: VALID_INTERVENTIONS.includes(parsed.suggestedIntervention) ? parsed.suggestedIntervention : null,
            summary: parsed.summary.trim(),
          };
        }
      }
    }
  } catch (err) {
    console.warn('Ollama unavailable for conversation analysis, using heuristic analysis fallback:', err.message);
  }

  // Robust Fallback Analysis when Ollama is offline or unreachable:
  const userMessages = conversation.filter(m => m.role === 'user').map(m => m.content).join(' ');
  const lowerText = userMessages.toLowerCase();

  const highRiskKeywords = ['kill', 'die', 'attack', 'threat', 'danger', 'scared', 'afraid', 'hurt', 'abuse', 'violence', 'blood', 'weapon'];
  const modRiskKeywords = ['stress', 'anxious', 'worried', 'sad', 'crying', 'help', 'nervous', 'trouble', 'sleep'];

  let highCount = highRiskKeywords.filter(k => lowerText.includes(k)).length;
  let modCount = modRiskKeywords.filter(k => lowerText.includes(k)).length;

  let sentiment = 0.2;
  let emotion = 0.3;
  let summary = `Check-in completed. User reported: "${userMessages.slice(0, 150)}${userMessages.length > 150 ? '...' : ''}"`;
  let suggestedIntervention = null;

  if (highCount > 0) {
    sentiment = 0.8;
    emotion = 0.85;
    suggestedIntervention = 'Legal Aid';
  } else if (modCount > 0) {
    sentiment = 0.5;
    emotion = 0.55;
    suggestedIntervention = 'Counselling';
  }

  return {
    sentiment,
    emotion,
    reason: highCount > 0 ? "High risk indicators detected during check-in." : "Standard check-in interaction evaluated.",
    suggestedIntervention,
    summary,
  };
}

// Case types this app tracks (case_types table) grouped into broad themes so
// the prompt below can gently steer toward relevant, safe territory (family/
// community/safety/logistics) without ever naming the case type, the
// offense, or the word "victim" - see CASE_TYPE_THEME_HINTS.
const CASE_TYPE_THEME_HINTS = {
  'Murder': 'loss, grief, and changes at home since a family member is gone',
  'Grievous Hurt': 'physical recovery, daily routines, and safety at home',
  'Arson': 'housing, belongings, and rebuilding a sense of stability',
  'Murder / Grievous Hurt / Arson': 'safety at home, recovery, and daily stability',
  'Rape': 'emotional wellbeing, comfort, and who they feel safe talking to - never anything about the incident itself',
  'Gang Rape': 'emotional wellbeing, comfort, and who they feel safe talking to - never anything about the incident itself',
  'Rape / Gang Rape': 'emotional wellbeing, comfort, and who they feel safe talking to - never anything about the incident itself',
  'Family Affected by Caste-Based Violence': 'how things feel in their neighbourhood/community and daily social life',
  'Witness Facing Intimidation or Threats': 'their sense of safety day-to-day and whether they feel any outside pressure',
};

function getCaseThemeHint(caseType) {
  return CASE_TYPE_THEME_HINTS[caseType] || 'everyday life, routine, and general wellbeing';
}

// Generates ONE interactive multiple-choice question - always the 3rd
// question onward (CheckinScreen.js asks two fixed, identical-for-everyone
// questions first; see SECOND_QUESTION below). `caseType` (from
// useUserDashboard()'s own `caseType` field) only ever nudges the *theme*
// of what's asked next, in the system prompt the user never sees - it must
// never be named, described, or referenced in the actual question text.
async function generateInteractiveQuestion(conversation, pastContext = '', caseType = null, model = OLLAMA_MODEL) {
  const INTERACTIVE_PROMPT = `You are Mansakha, a warm, everyday conversational companion doing a gentle wellbeing check-in. You are NOT a clinician, an investigator, or an intake form - you are more like a caring person catching up with someone.

Hard rules, no exceptions:
- Never use the word "victim" (or "survivor", "trauma", "abuse", "assault") anywhere in the question or options - refer to the person only as "you"/"they", never by a label.
- Never ask directly about the incident, the accused, the case, or any graphic detail. Do not reference their legal case at all.
- Never make the person feel singled out, diagnosed, or interrogated. Keep the tone as ordinary and low-pressure as checking in with a friend.
- Base this question on what they just said in the conversation so far - make it feel like a natural follow-up, not a scripted next item on a form.
- You may gently lean toward the theme of ${getCaseThemeHint(caseType)}, but only if it fits naturally after what they just said - otherwise ask about ordinary daily life (sleep, appetite, energy, people around them, small routines, what's helped lately).
- Vary your phrasing and options every time - avoid repeating the same question shape (e.g. don't default to "Yes/No/A little bit" every turn). Options should sound like things a real person would actually say.

Their past check-in summaries (for continuity only - never quote or reference this directly to them):
"""
${pastContext || 'No past context available.'}
"""

Provide 2 to 6 multiple-choice options for the user to select from - natural, varied, and including at least one gentle coping-oriented option where it fits.

Respond ONLY with a JSON object in this exact format:
{
  "question": "<your warm, ordinary-sounding question - no clinical or legal language>",
  "type": "single", // "single" if they should choose one, or "multi" if they can choose multiple
  "options": ["<option 1>", "<option 2>", ...]
}
`;

  const res = await fetch(CHAT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      stream: false,
      format: 'json',
      messages: [{ role: 'system', content: INTERACTIVE_PROMPT }, ...conversation],
      options: { temperature: 0.4 },
    }),
  });

  if (!res.ok) throw new Error(await res.text().catch(() => `Ollama error ${res.status}`));
  const data = await res.json();
  const raw = data?.message?.content;
  if (!raw) throw new Error('Ollama returned no question');

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error('Ollama returned a non-JSON question');
  }
  
  if (!parsed.question || !Array.isArray(parsed.options) || parsed.options.length < 2) {
    throw new Error('Ollama returned invalid question structure');
  }

  return parsed;
}

export { checkOllamaConnection, sendCompanionMessage, generateInteractiveQuestion, analyzeConversation, OPENING_GREETING, SECOND_QUESTION, OLLAMA_MODEL, containsSelfHarmRisk, ensureHelplineIfAtRisk, HELPLINE_MESSAGE };
