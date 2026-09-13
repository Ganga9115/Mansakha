import { useCallback, useRef, useState } from 'react';
import { Platform } from 'react-native';

/**
 * Universal Speech-to-Text hook powered by IIT Madras Speech Lab ASR API:
 * Documentation: https://speech-lab-iitm.github.io/SpeechLab/api.html
 * Supported languages: English, Tamil, Hindi, Gujarati, Kannada, Marathi, Telugu
 */
export const SPEECH_TO_TEXT_SUPPORTED =
  Platform.OS === 'web' &&
  typeof window !== 'undefined' &&
  typeof navigator !== 'undefined' &&
  !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);

const IITM_SPEECHLAB_API_URL = 'https://asr.iitm.ac.in/asr/v2/decode';
const LOCAL_DJANGO_AI_TRANSCRIBE_URL = 'http://127.0.0.1:8000/api/ai/transcribe/';

/**
 * Transcribes audio blob using the official IIT Madras Speech Lab ASR specification:
 * POST -F 'file=@audio.wav' -F 'language=english' -F 'vtt=false' https://asr.iitm.ac.in/asr/v2/decode
 * With seamless fallback to local IndicWhisper engine via Django AI backend.
 */
async function transcribeAudioBlob(blob, language = 'english') {
  const langLower = (language || 'english').toLowerCase();

  // 1. Direct IIT Madras Speech Lab ASR API
  try {
    const formData = new FormData();
    formData.append('file', blob, 'speech_recording.wav');
    formData.append('language', langLower);
    formData.append('vtt', 'false');

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    const res = await fetch(IITM_SPEECHLAB_API_URL, {
      method: 'POST',
      body: formData,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      if (data.status === 'success' && data.transcript?.trim()) {
        return {
          transcript: data.transcript.trim(),
          source: 'IIT Madras Speech Lab API (ASR v2)',
        };
      }
    }
  } catch (_) {
    // Fall through to Django AI backend if IITM public endpoint is behind campus proxy or CORS
  }

  // 2. Django AI backend transcribe pipeline (IIT Madras + AI4Bharat IndicWhisper local model)
  try {
    const formData = new FormData();
    formData.append('audio', blob, 'recording.wav');
    formData.append('language', langLower);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);

    const res = await fetch(LOCAL_DJANGO_AI_TRANSCRIBE_URL, {
      method: 'POST',
      body: formData,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      if (data.transcript?.trim()) {
        return {
          transcript: data.transcript.trim(),
          source: data.source || 'IIT Madras / AI4Bharat Speech Lab Engine',
        };
      }
    }
  } catch (err) {
    console.warn('[SpeechToText] Local transcribe service unreachable:', err.message);
  }

  return null;
}

export function useSpeechToText(onResult, options = {}) {
  const { language = 'english' } = options;
  const [listening, setListening] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const streamRef = useRef(null);
  const browserRecognitionRef = useRef(null);
  const browserTranscriptRef = useRef('');

  const stop = useCallback(() => {
    setListening(false);

    // Stop MediaRecorder
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch (_) {}
    }

    // Stop audio stream tracks
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    // Stop optional browser recognition
    if (browserRecognitionRef.current) {
      try {
        browserRecognitionRef.current.stop();
      } catch (_) {}
    }
  }, []);

  const start = useCallback(async () => {
    if (!SPEECH_TO_TEXT_SUPPORTED || listening) return;

    audioChunksRef.current = [];
    browserTranscriptRef.current = '';

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Setup MediaRecorder for capturing raw audio for IIT Madras Speech Lab API
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : 'audio/mp4';

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: recorder.mimeType || 'audio/wav' });
        if (audioBlob.size > 0) {
          setIsTranscribing(true);
          try {
            const result = await transcribeAudioBlob(audioBlob, language);
            if (result && result.transcript) {
              onResult(result.transcript);
            } else if (browserTranscriptRef.current.trim()) {
              // Fallback to browser transcript if remote/local STT returned empty
              onResult(browserTranscriptRef.current.trim());
            }
          } catch (e) {
            if (browserTranscriptRef.current.trim()) {
              onResult(browserTranscriptRef.current.trim());
            }
          } finally {
            setIsTranscribing(false);
          }
        }
      };

      recorder.start(250);
      setListening(true);

      // Optional: run Web Speech API alongside for real-time interim captions
      const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SpeechRecognitionCtor) {
        try {
          const recognition = new SpeechRecognitionCtor();
          recognition.continuous = true;
          recognition.interimResults = false;
          recognition.lang = language === 'hindi' ? 'hi-IN' : language === 'tamil' ? 'ta-IN' : 'en-IN';

          recognition.onresult = (event) => {
            let text = '';
            for (let i = event.resultIndex; i < event.results.length; i++) {
              if (event.results[i].isFinal) {
                text += event.results[i][0].transcript + ' ';
              }
            }
            if (text.trim()) {
              browserTranscriptRef.current = (browserTranscriptRef.current + ' ' + text).trim();
            }
          };

          recognition.onerror = () => {};
          recognition.onend = () => {};
          browserRecognitionRef.current = recognition;
          recognition.start();
        } catch (_) {}
      }
    } catch (err) {
      console.warn('Microphone permission denied or unavailable:', err);
      setListening(false);
    }
  }, [listening, language, onResult]);

  const toggle = useCallback(() => {
    if (listening) {
      stop();
    } else {
      start();
    }
  }, [listening, start, stop]);

  return {
    listening,
    isTranscribing,
    toggle,
    start,
    stop,
    supported: SPEECH_TO_TEXT_SUPPORTED,
  };
}
