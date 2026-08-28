// Local, on-device conversational AI for the Check-in screen - talks directly
// to a locally-running Ollama instance, the same way
// mansakha_local_ai_two_modes_fixed_voice.html does (plain fetch to
// /api/tags and /api/chat, no SDK). Runs entirely on the victim's own
// device/network; this never reaches Anthropic, Google, or Mansakha's own
// backend - the backend only sees the finished transcript + analysis
// (see useCheckin in services/hooks.js).

const OLLAMA_BASE_URL = process.env.EXPO_PUBLIC_OLLAMA_BASE_URL || 'http://127.0.0.1:11434';
const OLLAMA_MODEL = process.env.EXPO_PUBLIC_OLLAMA_MODEL || 'gemma3:4b';

const TAGS_URL = `${OLLAMA_BASE_URL}/api/tags`;
const CHAT_URL = `${OLLAMA_BASE_URL}/api/chat`;

const COMPANION_SYSTEM_PROMPT = `You are Mansakha, a calm, soft, and deeply empathetic conversational companion for victims of atrocities under India's SC/ST Act. These users have faced severe trauma, so you must be extremely sensitive, comforting, and supportive. 
Rule 1: NEVER interrogate the user. Do not ask them to elaborate on every single thing they say. Do not ask more than ONE question per response. Often, it is better to ask NO questions and simply validate their feelings.
Rule 2: Provide gentle advice and suggestions to improve their mental health. If they are stressed or anxious, gently suggest taking a deep breath, drinking water, or doing a simple grounding exercise.
Rule 3: Keep replies short (2-3 sentences max) and natural. 
Rule 4: Do not diagnose conditions, assign risk levels, or claim to be a doctor, lawyer, or police officer. 
Rule 5: If immediate danger is described, gently encourage them to contact the NHAA Helpline (14566, 24/7).`;

const OPENING_GREETING = "Hello. I'm here to listen. Take your time. How are you feeling today?";

const VALID_INTERVENTIONS = ['Counselling', 'Medical', 'Witness Protection', 'Relocation', 'Financial Assistance', 'Legal Aid', 'Rehabilitation'];

const ANALYSIS_SYSTEM_PROMPT = `You are the distress-analysis step of Mansakha, a check-in companion for victims of an atrocity under India's SC/ST (Prevention of Atrocities) Act. You will be given a full check-in conversation transcript. Read it and return ONLY a JSON object (no markdown fences, no extra text) with exactly these fields:
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
// summary" the app submits to /api/victim/checkin, which the backend runs
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

// Generates an interactive multiple-choice question based on history and past context.
async function generateInteractiveQuestion(conversation, pastContext = '', model = OLLAMA_MODEL) {
  const INTERACTIVE_PROMPT = `You are Mansakha, a highly empathetic conversational companion for a victim of trauma.
Your task is to generate the next question to check in on their mental health. 
Use the user's past interaction summaries as context to make the question highly personalized and relevant.

Past Context:
"""
${pastContext || 'No past context available.'}
"""

Instead of an open-ended question, you MUST provide 2 to 10 multiple-choice options for the user to select from.
The options should represent plausible ways the user might be feeling or want to respond. Include gentle, coping-oriented options.

Respond ONLY with a JSON object in this exact format:
{
  "question": "<your gentle, empathetic question>",
  "type": "single", // use "single" if they should choose one, or "multi" if they can choose multiple
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

export { checkOllamaConnection, sendCompanionMessage, generateInteractiveQuestion, analyzeConversation, OPENING_GREETING, OLLAMA_MODEL };
