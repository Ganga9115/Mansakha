import { useCallback, useRef, useState } from 'react';
import { Platform } from 'react-native';

// Speech-to-text only exists via the browser's Web Speech API - CheckinScreen.js's
// Call mode was the first place this app used it (its own always-listening,
// speak-then-listen conversational loop is tightly coupled to that screen's call
// state machine and not a clean drop-in elsewhere). This hook extracts just the
// reusable bit - "tap to start dictating, get the transcribed text back" - for any
// screen that wants a simple mic-to-text button next to a text field.
export const SPEECH_TO_TEXT_SUPPORTED =
  Platform.OS === 'web' && typeof window !== 'undefined' && !!(window.SpeechRecognition || window.webkitSpeechRecognition);

// `onResult(text)` fires once per completed utterance with the final
// transcript - callers append it to whatever's already typed.
export function useSpeechToText(onResult) {
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef(null);

  const stop = useCallback(() => {
    try {
      recognitionRef.current?.stop();
    } catch (e) {
      // no-op - stop() on an already-stopped/never-started recognizer throws in some browsers
    }
  }, []);

  const start = useCallback(() => {
    if (!SPEECH_TO_TEXT_SUPPORTED || listening) return;
    
    // Explicitly request mic permission first to prevent the browser's permission prompt 
    // from interrupting or timing out the SpeechRecognition's delicate first-run state machine.
    navigator.mediaDevices.getUserMedia({ audio: true })
      .then(() => {
        const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
        const recognition = new SpeechRecognitionCtor();
        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.lang = 'en-IN';
        recognition.onstart = () => setListening(true);
        recognition.onresult = (event) => {
          let finalText = '';
          for (let i = event.resultIndex; i < event.results.length; i++) {
            if (event.results[i].isFinal) finalText += event.results[i][0].transcript;
          }
          if (finalText.trim()) onResult(finalText.trim());
        };
        recognition.onerror = () => setListening(false);
        recognition.onend = () => setListening(false);
        recognitionRef.current = recognition;
        try {
          recognition.start();
        } catch (e) {
          setListening(false);
        }
      })
      .catch((err) => {
        console.warn('Mic permission denied or unavailable:', err);
        setListening(false);
      });
  }, [listening, onResult]);

  const toggle = useCallback(() => {
    if (listening) stop();
    else start();
  }, [listening, start, stop]);

  return { listening, toggle, supported: SPEECH_TO_TEXT_SUPPORTED };
}
