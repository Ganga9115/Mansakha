// Client adapter for Mansakha's Django AI Backend service
// Provides Voice Stress Analytics, Fine-tuned Indic Sentiment & Emotion models,
// Multilingual Speech-to-Text, and Multimodal Screening.
// Falls back seamlessly to Ollama or clinical heuristics if Django server is offline.

const DJANGO_AI_URL = process.env.DJANGO_AI_URL || 'http://127.0.0.1:8000';
const { callOllama, callOllamaChat } = require('./ollama');

/**
 * Check if the Django AI backend is running and healthy.
 */
async function checkDjangoHealth(timeoutMs = 2000) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(`${DJANGO_AI_URL}/api/ai/health/`, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (!res.ok) return { online: false };
    const data = await res.json();
    return { online: true, ...data };
  } catch (err) {
    return { online: false, error: err.message };
  }
}

/**
 * Analyzes text using local fine-tuned XLM-RoBERTa / PS094 models via Django.
 */
async function analyzeTextViaDjango(text, timeoutMs = 8000) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(`${DJANGO_AI_URL}/api/ai/analyze-text/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      return {
        success: true,
        sentimentRaw: data.sentiment_raw,
        emotionScore: data.emotion_score,
        dominantEmotion: data.emotion?.dominant_emotion || 'neutral',
        sentimentDetails: data.sentiment,
        emotionDetails: data.emotion,
      };
    }
  } catch (err) {
    // Fallback to Ollama
  }
  return null;
}

/**
 * Analyzes audio for Voice Stress Analytics (pitch contour, micro-tremors/jitter, voicing).
 */
async function analyzeVoiceViaDjango(audioBase64, timeoutMs = 12000) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(`${DJANGO_AI_URL}/api/ai/analyze-voice/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ audio_base64: audioBase64 }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      return {
        success: true,
        voiceStressScore: data.voice_stress_score || 0.0,
        dominantEmotion: data.dominant_emotion || 'neutral',
        probabilities: data.emotion_probabilities || {},
        pitchMean: data.pitch_mean || 0.0,
        pitchJitter: data.pitch_jitter || 0.0,
        voicedFraction: data.voiced_fraction || 0.0,
      };
    }
  } catch (err) {
    console.warn('[Django AI] Voice stress analysis failed or timed out:', err.message);
  }
  return { success: false, voiceStressScore: 0.0 };
}

/**
 * Transcribes audio via IIT Madras Speech Lab ASR API:
 * https://speech-lab-iitm.github.io/SpeechLab/api.html
 * (with local AI4Bharat IndicWhisper engine fallback).
 */
async function transcribeViaDjango(audioBase64, language = 'auto', timeoutMs = 15000) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(`${DJANGO_AI_URL}/api/ai/transcribe/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ audio_base64: audioBase64, language }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      return await res.json();
    }
  } catch (err) {
    console.warn('[Django AI] Transcription failed:', err.message);
  }
  return { transcript: '', detected_language: 'en' };
}

/**
 * Full multimodal pipeline (Text + Voice Audio).
 */
async function analyzeMultimodalViaDjango(text, audioBase64, timeoutMs = 18000) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(`${DJANGO_AI_URL}/api/ai/multimodal/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, audio_base64: audioBase64 }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      return {
        success: true,
        transcript: data.transcript,
        language: data.language,
        sentimentRaw: data.sentiment_raw,
        emotionScore: data.emotion_score,
        voiceStressScore: data.voice_stress_score || 0.0,
        reason: data.reason,
        suggestedIntervention: data.suggested_intervention,
        details: data,
      };
    }
  } catch (err) {
    console.warn('[Django AI] Multimodal analysis offline, falling back to Ollama:', err.message);
  }
  return null;
}

/**
 * Conversational companion endpoint.
 */
async function chatViaDjango(message, timeoutMs = 15000) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(`${DJANGO_AI_URL}/api/ai/chat/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      return await res.json();
    }
  } catch (err) {
    // Fallback to Ollama
  }
  return null;
}

module.exports = {
  DJANGO_AI_URL,
  checkDjangoHealth,
  analyzeTextViaDjango,
  analyzeVoiceViaDjango,
  transcribeViaDjango,
  analyzeMultimodalViaDjango,
  chatViaDjango,
};
