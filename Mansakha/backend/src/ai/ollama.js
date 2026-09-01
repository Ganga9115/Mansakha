const OLLAMA_BASE_URL = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'gemma3:4b';

/**
 * Generate the next question in the dynamic distress questionnaire.
 * @param {Array} previousResponses Array of { q, a } objects representing previous questions and the user's answers.
 * @returns {Promise<string>} The next question to ask.
 */
async function generateNextQuestion(previousResponses) {
  const isFirst = !previousResponses || previousResponses.length === 0;

  let promptText = '';
  if (isFirst) {
    promptText = `You are a highly empathetic AI mental health companion for users who are victims of crime.
Your goal is to understand how the user is feeling right now, in order to assess their current distress level.
Ask an open-ended, gentle starting question to invite them to share how they are doing today.
Respond ONLY with the question itself. Keep it under 2 sentences. Do not use markdown.`;
  } else {
    const history = previousResponses.map(r => `Question: ${r.q}\nAnswer: ${r.a}`).join('\n\n');
    promptText = `You are a highly empathetic AI mental health companion. You are in the middle of a check-in conversation with a user who is a victim of a crime.
Here is the conversation history so far:
${history}

Based on their last answer, validate their feelings and offer a gentle, comforting affirmation.
If they seem distressed, offer a soft suggestion to help them feel safe or grounded (like taking a deep breath).
You do NOT need to ask a question if they gave a short answer. Do not interrogate them. If you do ask a question, ask a maximum of ONE gentle follow-up question.
Respond ONLY with your reply. Keep it under 2 sentences. Do not use markdown.`;
  }

  const response = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      prompt: promptText,
      stream: false
    })
  });

  if (!response.ok) {
    throw new Error(`Ollama API error: ${response.statusText}`);
  }

  const data = await response.json();
  return data.response.trim();
}

/**
 * Predict distress score based on all 15 questions and answers.
 * @param {Array} allResponses Array of { q, a } objects.
 * @returns {Promise<{score: number, summary: string}>}
 */
async function predictDistressScore(allResponses) {
  const history = allResponses.map(r => `Q: ${r.q}\nA: ${r.a}`).join('\n\n');
  const promptText = `You are an expert psychological AI analyzing a conversation with a user who is a victim of a crime.
Here is the full conversation:
${history}

Task 1: Analyze the user's distress level based on their answers. Return a distress score between 0 and 100, where:
0-29: Low distress, feeling safe and coping well.
30-54: Moderate distress, some anxiety but manageable.
55-79: High distress, feeling overwhelmed, unsafe, or struggling.
80-100: Critical distress, immediate risk of harm, severe trauma symptoms.

Task 2: Provide a brief clinical summary (2-3 sentences) of their current state for a counsellor.

Respond STRICTLY in the following JSON format:
{
  "score": <number>,
  "summary": "<string>"
}`;

  const response = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      prompt: promptText,
      stream: false,
      format: 'json'
    })
  });

  if (!response.ok) {
    throw new Error(`Ollama API error: ${response.statusText}`);
  }

  const data = await response.json();

  try {
    const parsed = JSON.parse(data.response);
    return {
      score: typeof parsed.score === 'number' ? parsed.score : parseInt(parsed.score, 10),
      summary: parsed.summary || 'No summary provided.'
    };
  } catch (err) {
    console.error('Failed to parse Ollama distress score JSON:', data.response);
    // Fallback if parsing fails
    return { score: 50, summary: "Could not parse AI summary." };
  }
}

/**
 * Feature improvement point 1: score a chunk of AI-chat conversation once it
 * crosses the 5,000-word threshold (see POST /api/user/chat/log). Same
 * prompt/response shape as predictDistressScore's 0-100 scale, just fed a
 * running chat transcript instead of a fixed 15-question interview.
 * @param {Array<{sender: 'user'|'ai', body: string}>} messages
 * @returns {Promise<{score: number, summary: string}>}
 */
async function analyzeChatTranscript(messages) {
  const transcript = messages.map((m) => `${m.sender === 'user' ? 'Person' : 'Mansakha'}: ${m.body}`).join('\n');
  const promptText = `You are an expert psychological AI analyzing an ongoing chat conversation between a supportive assistant ("Mansakha") and a user who is a victim of a crime.
Here is the conversation so far:
${transcript}

Task 1: Analyze the person's (not Mansakha's) distress level based on their messages. Return a distress score between 0 and 100, where:
0-29: Low distress, feeling safe and coping well.
30-54: Moderate distress, some anxiety but manageable.
55-79: High distress, feeling overwhelmed, unsafe, or struggling.
80-100: Critical distress, immediate risk of harm, severe trauma symptoms.

Task 2: Provide a brief clinical summary (2-3 sentences) of their current state for a counsellor.

Respond STRICTLY in the following JSON format:
{
  "score": <number>,
  "summary": "<string>"
}`;

  const response = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      prompt: promptText,
      stream: false,
      format: 'json',
    }),
  });

  if (!response.ok) {
    throw new Error(`Ollama API error: ${response.statusText}`);
  }

  const data = await response.json();

  try {
    const parsed = JSON.parse(data.response);
    return {
      score: typeof parsed.score === 'number' ? parsed.score : parseInt(parsed.score, 10),
      summary: parsed.summary || 'No summary provided.',
    };
  } catch (err) {
    console.error('Failed to parse Ollama chat-analysis JSON:', data.response);
    return { score: 50, summary: 'Could not parse AI summary.' };
  }
}

/**
 * Feature improvement point 2: analyze a real IVRS call transcript, once the
 * (separately-integrated) IVRS provider delivers one via
 * POST /api/user/:userId/ivrs-call-result. Same 0-100/summary contract as
 * the other two analyzers here, just fed a raw call transcript.
 * @param {string} transcriptText
 * @returns {Promise<{score: number, summary: string}>}
 */
async function analyzeCallTranscript(transcriptText) {
  const promptText = `You are an expert psychological AI analyzing the transcript of a phone call (IVRS) with a user who is a victim of a crime.
Here is the call transcript:
${transcriptText}

Task 1: Analyze the caller's distress level based on what they said. Return a distress score between 0 and 100, where:
0-29: Low distress, feeling safe and coping well.
30-54: Moderate distress, some anxiety but manageable.
55-79: High distress, feeling overwhelmed, unsafe, or struggling.
80-100: Critical distress, immediate risk of harm, severe trauma symptoms.

Task 2: Provide a brief clinical summary (2-3 sentences) of their current state for a counsellor.

Respond STRICTLY in the following JSON format:
{
  "score": <number>,
  "summary": "<string>"
}`;

  const response = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      prompt: promptText,
      stream: false,
      format: 'json',
    }),
  });

  if (!response.ok) {
    throw new Error(`Ollama API error: ${response.statusText}`);
  }

  const data = await response.json();

  try {
    const parsed = JSON.parse(data.response);
    return {
      score: typeof parsed.score === 'number' ? parsed.score : parseInt(parsed.score, 10),
      summary: parsed.summary || 'No summary provided.',
    };
  } catch (err) {
    console.error('Failed to parse Ollama call-analysis JSON:', data.response);
    return { score: 50, summary: 'Could not parse AI summary.' };
  }
}

module.exports = {
  generateNextQuestion,
  predictDistressScore,
  analyzeChatTranscript,
  analyzeCallTranscript,
};
