import React, { useEffect, useRef, useState, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, Platform, Modal } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors } from '../../shared/theme/colors';
import { radius } from '../../shared/theme/radius';
import { Avatar3DController } from './Avatar3DController';
import AvatarGLView from './AvatarGLView';
import { ensureHelplineIfAtRisk, containsSelfHarmRisk } from '../../shared/services/ollamaClient';
import { useReportSelfHarmRisk } from '../../shared/services/hooks';

const maleCounsellorAsset = require('../../../../assets/avatar_male_counsellor.png');

const getAssetUri = (asset) => {
  if (typeof asset === 'string') return asset;
  if (asset && asset.uri) return asset.uri;
  if (asset && asset.default) {
    if (typeof asset.default === 'string') return asset.default;
    if (asset.default.uri) return asset.default.uri;
  }
  return '';
};

// Unlike this constant, ChatScreen.js and ollamaClient.js already read
// EXPO_PUBLIC_OLLAMA_BASE_URL - this one was hardcoded to 127.0.0.1 (i.e.
// only ever the current device), which is what made it impossible to point
// the live call at a friend's/teammate's machine running Ollama, even
// though the env var existed and worked for the other two Ollama call
// sites.
const OLLAMA_BASE_URL = process.env.EXPO_PUBLIC_OLLAMA_BASE_URL || "http://127.0.0.1:11434";
const OLLAMA_URL = OLLAMA_BASE_URL + "/api/chat";
const OLLAMA_MODEL = process.env.EXPO_PUBLIC_OLLAMA_MODEL || "gemma3:4b";

const CALL_COMPANION_PROMPT = `You are Mansakha, a warm, compassionate, and attentive conversational companion on a live call with a person navigating distress or trauma under India's SC/ST (Prevention of Atrocities) Act. You are NOT an intake counselor, an interviewer, or an interrogator.

Strict Conversational Rules:
0. SAFETY OVERRIDE - SUICIDAL THOUGHTS, SELF-HARM, OR THREATS TO LIFE:
- Overrides every other rule here, including brevity, whenever it applies.
- The instant they express any suicidal thought, self-harm intent, wish to die, or a threat to their own life - however indirect - immediately and clearly say: "Please call the NHAA Helpline at 14566 right now - they're available 24/7 and can help immediately. You can also reach your counsellor through this app." Say this plainly and don't bury it in a longer reflection.
- Stay warm, but never respond to this with only validation/listening and no helpline pointer.

1. BREAK THE INTERROGATION PATTERN:
- Do NOT end every message with a question. In most turns, ask NO questions at all. Simply sit with what they shared, validate their feelings, or offer a soothing reflection.
- Active listening and supportive presence matter more than questioning.

2. NEVER REPEAT QUESTIONS OR USE GENERIC PROMPTS:
- Never ask filler prompts like "Can you tell me more about that?", "How does that make you feel?", or "What's on your mind?".
- Only ask a question if they explicitly open a specific topic, and make it deeply specific to what they said.

3. ELIMINATE THERAPIST CLICHÉS AND REPEATED STOCK LINES:
- Never use formulaic phrases like "I hear you...", "Thank you for being so brave...", or "It takes courage...". Speak naturally like an empathetic friend.
- Do not repeat "I am there for you", "I'm here for you", "I'm here to listen", or close variants across the call - say something like this at most once, if at all, and never as your default opener or closer.

4. CONCISENESS:
- Keep spoken replies strictly to 1 or 2 short, natural sentences so it feels like a genuine human conversation.

5. ADVISE LIKE A REAL COUNSELLOR, DON'T JUST LISTEN:
- When they describe being stuck in a bad thought spiral, don't just say you're listening - gently point them toward one small, concrete way forward (a grounding step, a reason to hold on, someone to reach out to, something to do right now), the way an experienced human counsellor would.
- Still one warm, specific, actionable suggestion at a time, spoken naturally - never a list read aloud.

6. LANGUAGE CONSISTENCY:
- Always reply entirely in the exact language the user speaks. Never mix languages.

7. NO FORENSIC SCRUTINY, TOXIC POSITIVITY, OR FALSE LEGAL GUARANTEES:
- Never question their story or ask for evidence, or ask them to describe or re-explain what happened - to them or to anyone they've lost. Never dismiss pain with "Everything happens for a reason". Never promise specific court verdicts or compensation dates.

8. ANSWER DIRECT, PRACTICAL QUESTIONS DIRECTLY:
- If they ask something concrete ("what should I do about the case", "should I go to the hearing") - answer it plainly. Do not deflect a real question into pure emotional reflection - that reads as not listening. Give a real, useful answer or point them to their counsellor/Legal Aid, then keep any emotional acknowledgment brief and separate.

9. IF THEY ARE CARRYING MORE THAN ONE THING, NAME EACH ONE - DON'T BLUR THEM:
- If someone is dealing with several distinct sources of pain at once (grief for someone lost, alongside their own safety or recovery), acknowledge each specifically when relevant, rather than one vague "everything you're going through". Follow whichever one they bring up in the moment - don't steer them to the other because it seems more central to their case.`;

export default function MansakhaCallModal({
  visible,
  onEndCall,
  onNewMessage,
}) {
  const [callDuration, setCallDuration] = useState(0);
  const [callStatus, setCallStatus] = useState('Connected');
  const [aiSpeechState, setAiSpeechState] = useState('speaking'); // 'speaking' | 'listening' | 'thinking'
  const [captions, setCaptions] = useState('');
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [isVideoMode, setIsVideoMode] = useState(false);
  const [facingMode, setFacingMode] = useState('user');
  const [counsellorGender, setCounsellorGender] = useState('male'); // 'male' | 'female'
  const [hasCameraFeed, setHasCameraFeed] = useState(false);

  const reportSelfHarmRisk = useReportSelfHarmRisk();

  const canvasRef = useRef(null);
  const avatar3dContainerRef = useRef(null);
  const avatarControllerRef = useRef(null);
  const avatarCanvasRef = useRef(null);
  const userVideoRef = useRef(null);
  const userVideoStreamRef = useRef(null);
  const streamRef = useRef(null);
  const recognitionRef = useRef(null);
  const timerRef = useRef(null);
  const animFrameRef = useRef(null);
  const isCallActiveRef = useRef(false);
  const speechStartRef = useRef(Date.now());
  const lastWordTimeRef = useRef(0);

  // Format call duration into MM:SS
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  // Configure Audio Output Route (Earpiece receiver for voice call vs Loudspeaker for video call)
  const configureAudioRoute = useCallback(async (videoMode) => {
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.mediaDevices?.enumerateDevices) {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const outputs = devices.filter(d => d.kind === 'audiooutput');
        if (outputs.length > 0 && typeof HTMLMediaElement !== 'undefined' && 'setSinkId' in HTMLMediaElement.prototype) {
          const target = videoMode
            ? outputs.find(d => d.label.toLowerCase().includes('speaker') || d.deviceId === 'default') || outputs[0]
            : outputs.find(d => d.label.toLowerCase().includes('earpiece') || d.label.toLowerCase().includes('receiver') || d.label.toLowerCase().includes('headset')) || outputs[0];
          
          if (target && userVideoRef.current && userVideoRef.current.setSinkId) {
            await userVideoRef.current.setSinkId(target.deviceId);
          }
        }
      } catch (_) {}
    }
  }, []);

  // Text-to-Speech Engine with Voice Routing & Gender Tuning
  const speakText = useCallback((text, onComplete) => {
    if (Platform.OS !== 'web' || typeof window === 'undefined' || !window.speechSynthesis) {
      if (onComplete) setTimeout(onComplete, 2000);
      return;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    speechStartRef.current = Date.now();
    lastWordTimeRef.current = performance.now();

    // Volume & acoustic profile:
    // Voice call: softer, closer earpiece volume (0.78)
    // Video call: loudspeaker volume (1.0)
    utterance.volume = isVideoMode ? 1.0 : 0.78;

    // Dynamically retrieve available system voices
    const voices = window.speechSynthesis.getVoices();

    if (counsellorGender === 'male') {
      utterance.pitch = 0.88; // Deep, grounded, calm masculine resonance
      utterance.rate = 0.93;  // Reassuring, unhurried pace
      const maleVoice = voices.find(v => {
        const name = (v.name || '').toLowerCase();
        return (
          name.includes('david') ||
          name.includes('ravi') ||
          name.includes('mark') ||
          name.includes('george') ||
          name.includes('alex') ||
          name.includes('google uk english male') ||
          (name.includes('male') && !name.includes('female'))
        );
      }) || voices.find(v => v.lang.includes('en-IN') || v.lang.includes('en-GB') || v.lang.includes('en-US'));
      if (maleVoice) utterance.voice = maleVoice;
    } else {
      utterance.pitch = 1.08; // Warm, gentle, empathetic feminine tone
      utterance.rate = 0.95;  // Soothing, attentive pace
      const femaleVoice = voices.find(v => {
        const name = (v.name || '').toLowerCase();
        return (
          name.includes('zira') ||
          name.includes('heera') ||
          name.includes('susan') ||
          name.includes('samantha') ||
          name.includes('female') ||
          name.includes('natural') ||
          name.includes('google uk english female') ||
          name.includes('victoria') ||
          name.includes('karen')
        );
      }) || voices.find(v => v.lang.includes('en-IN') || v.lang.includes('en-GB') || v.lang.includes('en-US'));
      if (femaleVoice) utterance.voice = femaleVoice;
    }

    setAiSpeechState('speaking');
    setCaptions(text);

    // Sync avatar mouth movement precisely with spoken word boundaries
    utterance.onboundary = (event) => {
      if (event.name === 'word') {
        lastWordTimeRef.current = performance.now();
      }
    };

    utterance.onend = () => {
      setAiSpeechState('listening');
      if (onComplete) onComplete();
    };

    utterance.onerror = () => {
      setAiSpeechState('listening');
      if (onComplete) onComplete();
    };

    window.speechSynthesis.speak(utterance);
  }, [counsellorGender, isVideoMode]);

  // Speech Recognition listener
  const startListening = useCallback(() => {
    if (!isCallActiveRef.current || isMicMuted) return;
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setCallStatus('Voice connected');
      return;
    }

    try {
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch (_) {}
      }

      const recognition = new SpeechRecognition();
      recognitionRef.current = recognition;
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = 'en-IN';

      recognition.onstart = () => {
        setAiSpeechState('listening');
        setCallStatus('Listening to you...');
      };

      recognition.onresult = (event) => {
        let transcript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript;
        }

        const isFinal = event.results[event.results.length - 1].isFinal;
        if (isFinal && transcript.trim()) {
          handleUserSpeech(transcript.trim());
        }
      };

      recognition.onerror = (e) => {
        if (e.error !== 'no-speech' && e.error !== 'aborted') {
          console.warn('Speech recognition error:', e.error);
        }
      };

      recognition.onend = () => {
        if (isCallActiveRef.current && aiSpeechState === 'listening' && !isMicMuted) {
          setTimeout(() => {
            if (isCallActiveRef.current && aiSpeechState === 'listening') {
              try { recognition.start(); } catch (_) {}
            }
          }, 400);
        }
      };

      recognition.start();
    } catch (err) {
      console.warn('Could not start recognition:', err);
    }
  }, [isMicMuted, aiSpeechState]);

  // Handle user speech turn -> Ollama reply
  const handleUserSpeech = async (userText) => {
    if (!isCallActiveRef.current) return;
    setAiSpeechState('thinking');
    setCallStatus('Mansakha is reflecting...');

    // Detect emotional valence from user speech to display human empathic expressions
    const lower = userText.toLowerCase();
    const isDistress =
      lower.includes('overwhelm') ||
      lower.includes('anxious') ||
      lower.includes('scared') ||
      lower.includes('afraid') ||
      lower.includes('pain') ||
      lower.includes('hurt') ||
      lower.includes('threat') ||
      lower.includes('alone') ||
      lower.includes('crying') ||
      lower.includes('police') ||
      lower.includes('attack') ||
      lower.includes('fear') ||
      lower.includes('help');
    const isRelief =
      lower.includes('better') ||
      lower.includes('thank') ||
      lower.includes('good') ||
      lower.includes('relief') ||
      lower.includes('okay') ||
      lower.includes('calm');

    if (avatarControllerRef.current) {
      avatarControllerRef.current.setEmotion(isDistress ? 'empathy' : isRelief ? 'reassuring' : 'thinking');
    }

    if (onNewMessage) {
      onNewMessage({ role: 'user', content: userText, channel: isVideoMode ? 'video_call' : 'voice_call' });
    }

    try {
      const response = await fetch(OLLAMA_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: OLLAMA_MODEL,
          stream: false,
          messages: [
            { role: 'system', content: CALL_COMPANION_PROMPT },
            { role: 'user', content: userText },
          ],
          options: { temperature: 0.5 },
        }),
      });

      let aiReply = "I am right here with you. Take a slow, gentle breath.";
      if (response.ok) {
        const data = await response.json();
        const content = data?.message?.content?.trim();
        if (content) aiReply = content;
      }
      // Deterministic safety net - see ollamaClient.js's own comment: the
      // system prompt's crisis-redirect rule alone isn't reliable enough
      // with this local model. Applied before both the spoken reply and the
      // transcript below, so a live call gets the same guarantee as text chat.
      aiReply = ensureHelplineIfAtRisk(userText, aiReply);
      // Fire-and-forget, immediate, not gated by the normal chat word-count
      // scoring threshold - see the backend route's own comment.
      if (containsSelfHarmRisk(userText)) {
        reportSelfHarmRisk.mutate({ message: userText, channel: isVideoMode ? 'video_call' : 'voice_call' });
      }

      if (onNewMessage) {
        onNewMessage({ role: 'assistant', content: aiReply, channel: isVideoMode ? 'video_call' : 'voice_call' });
      }

      setCallStatus('Connected');
      if (avatarControllerRef.current) {
        avatarControllerRef.current.setEmotion('reassuring');
      }

      speakText(aiReply, () => {
        if (avatarControllerRef.current) {
          avatarControllerRef.current.setEmotion('listening');
        }
        if (isCallActiveRef.current) {
          startListening();
        }
      });
    } catch (err) {
      const fallback = ensureHelplineIfAtRisk(userText, "I hear you. You are safe here, please take your time.");
      if (containsSelfHarmRisk(userText)) {
        reportSelfHarmRisk.mutate({ message: userText, channel: isVideoMode ? 'video_call' : 'voice_call' });
      }
      if (avatarControllerRef.current) {
        avatarControllerRef.current.setEmotion('reassuring');
      }
      speakText(fallback, () => {
        if (avatarControllerRef.current) {
          avatarControllerRef.current.setEmotion('listening');
        }
        if (isCallActiveRef.current) {
          startListening();
        }
      });
    }
  };

  // Video Mode Toggle & User Camera Stream (WhatsApp-style Picture-in-Picture)
  const toggleVideoMode = async () => {
    const nextVideoMode = !isVideoMode;
    setIsVideoMode(nextVideoMode);
    configureAudioRoute(nextVideoMode);

    if (!nextVideoMode) {
      setHasCameraFeed(false);
      if (userVideoStreamRef.current) {
        userVideoStreamRef.current.getTracks().forEach(t => t.stop());
        userVideoStreamRef.current = null;
      }
      if (userVideoRef.current) {
        userVideoRef.current.srcObject = null;
      }
    } else {
      if (Platform.OS === 'web' && navigator.mediaDevices?.getUserMedia) {
        try {
          const vStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode },
            audio: false,
          });
          userVideoStreamRef.current = vStream;
          setHasCameraFeed(true);
          if (userVideoRef.current) {
            userVideoRef.current.srcObject = vStream;
          }
        } catch (err) {
          console.warn('Camera access error:', err);
          setHasCameraFeed(false);
        }
      }
    }
  };

  const flipCamera = async () => {
    const nextFacing = facingMode === 'user' ? 'environment' : 'user';
    setFacingMode(nextFacing);
    if (userVideoStreamRef.current) {
      userVideoStreamRef.current.getTracks().forEach(t => t.stop());
    }
    if (Platform.OS === 'web' && navigator.mediaDevices?.getUserMedia) {
      try {
        const vStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: nextFacing },
          audio: false,
        });
        userVideoStreamRef.current = vStream;
        setHasCameraFeed(true);
        if (userVideoRef.current) {
          userVideoRef.current.srcObject = vStream;
        }
      } catch (err) {
        console.warn('Camera flip error:', err);
      }
    }
  };

  // Microphone Stream Setup
  const setupMediaStream = async () => {
    if (Platform.OS !== 'web' || !navigator.mediaDevices?.getUserMedia) return;
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
      streamRef.current = stream;
    } catch (err) {
      console.warn('Microphone access error:', err);
    }
  };

  // 3D Avatar Controller Lifecycle (Active only when user clicks Video Call)
  useEffect(() => {
    if (!visible || !isVideoMode) {
      if (avatarControllerRef.current) {
        avatarControllerRef.current.dispose();
        avatarControllerRef.current = null;
      }
      return;
    }

    let controller;
    if (Platform.OS === 'web') {
      const container = avatar3dContainerRef.current;
      if (!container) return;
      controller = avatarControllerRef.current;
      if (!controller) {
        controller = new Avatar3DController(container);
        avatarControllerRef.current = controller;
      }
    } else {
      // Native: <AvatarGLView ref={avatarControllerRef}> below already
      // populated avatarControllerRef.current (its imperative handle) as
      // soon as it mounted - the handle itself queues loadModel until its
      // internal GL context is actually ready, so there's nothing to
      // construct here.
      controller = avatarControllerRef.current;
      if (!controller) return;
    }

    // Male: casual_male.glb (exact modern avatar: brown hair, blue shirt, no cowboy hat!)
    // Female: counselor_brunette.glb (warm brunette counselor)
    // Native has no web server to resolve a relative path against, so it
    // loads the same files from the already-deployed web app instead.
    const modelFile = counsellorGender === 'male' ? 'casual_male.glb' : 'counselor_brunette.glb';
    const primaryModel = Platform.OS === 'web'
      ? `/models/${modelFile}`
      : `https://mansakha-app.web.app/models/${modelFile}`;

    controller.loadModel(primaryModel).catch((err) => {
      console.warn('Could not load 3D GLB model:', err);
    });

    let animId = null;
    const renderLoop = () => {
      if (controller && !controller.isDisposed) {
        if (aiSpeechState === 'speaking') {
          const time = Date.now() - speechStartRef.current;
          const wordElapsed = performance.now() - lastWordTimeRef.current;

          // Natural human speech syllabic oscillation (3.5 Hz to 5.5 Hz)
          const primarySyllable = Math.sin(time * 0.024);
          const secondaryPhoneme = Math.sin(time * 0.038);
          
          // Authentic word burst from speech boundary event
          const wordBurst = wordElapsed < 280 ? Math.sin((wordElapsed / 280) * Math.PI) : 0;
          
          // Base syllabic jaw movement
          const baseJaw = Math.max(0, primarySyllable * 0.72 + secondaryPhoneme * 0.28);
          
          // Visible jaw movement up to 0.88 for unmistakable speech articulation
          const jaw = Math.min(0.92, Math.max(baseJaw * 0.82, wordBurst * 0.88));

          const funnel = Math.max(0, Math.sin(time * 0.016)) * 0.55;
          const pucker = Math.max(0, Math.cos(time * 0.022)) * 0.45;
          const smile = Math.max(0, Math.sin(time * 0.010)) * 0.35;

          controller.updateLipSync({
            jawOpen: jaw,
            mouthFunnel: funnel,
            mouthPucker: pucker,
            mouthSmile: smile,
          });
        } else {
          controller.updateLipSync({ jawOpen: 0, mouthFunnel: 0, mouthPucker: 0, mouthSmile: 0 });
        }

        controller.render();
      }
      animId = requestAnimationFrame(renderLoop);
    };

    animId = requestAnimationFrame(renderLoop);
    return () => {
      if (animId) cancelAnimationFrame(animId);
    };
  }, [visible, isVideoMode, counsellorGender, aiSpeechState]);

  // 3D Animated Hologram Particle Sphere & Audio Frequency Equalizer (Voice Call Mode)
  useEffect(() => {
    if (!visible || isVideoMode || Platform.OS !== 'web') return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const updateDimensions = () => {
      const rect = canvas.getBoundingClientRect();
      const cssSize = Math.min(rect.width || 360, rect.height || 360);
      const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) ? Math.min(window.devicePixelRatio, 2) : 1;
      canvas.width = cssSize * dpr;
      canvas.height = cssSize * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      return cssSize;
    };

    let size = updateDimensions();
    let width = size;
    let height = size;

    // Generate 3D spherical particle cloud
    const PARTICLE_COUNT = 160;
    const particles = [];
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(Math.random() * 2 - 1);
      const r = 88 + Math.random() * 25;
      particles.push({
        x: r * Math.sin(phi) * Math.cos(theta),
        y: r * Math.sin(phi) * Math.sin(theta),
        z: r * Math.cos(phi),
        baseR: r,
        color: i % 3 === 0 ? '#38BDF8' : i % 3 === 1 ? '#818CF8' : '#34D399',
        size: 1.8 + Math.random() * 2.2,
      });
    }

    let angleX = 0;
    let angleY = 0;
    let pulse = 0;
    let animId = null;

    const render = () => {
      ctx.clearRect(0, 0, width, height);

      const centerX = width / 2;
      const centerY = height / 2 - 20;

      pulse += 0.05;
      const isSpeaking = aiSpeechState === 'speaking';
      const isListening = aiSpeechState === 'listening';

      angleY += isSpeaking ? 0.024 : isListening ? 0.012 : 0.008;
      angleX += isSpeaking ? 0.014 : 0.006;

      const dynamicRadiusScale = isSpeaking
        ? 1 + Math.sin(pulse * 2.2) * 0.15
        : isListening
        ? 1 + Math.sin(pulse * 1.1) * 0.08
        : 1 + Math.sin(pulse * 0.5) * 0.03;

      // 1. Ambient Radial Glow Aura
      const glowGrad = ctx.createRadialGradient(
        centerX, centerY, 10,
        centerX, centerY, 150 * dynamicRadiusScale
      );
      if (isSpeaking) {
        glowGrad.addColorStop(0, 'rgba(56, 189, 248, 0.45)');
        glowGrad.addColorStop(0.5, 'rgba(129, 140, 248, 0.18)');
        glowGrad.addColorStop(1, 'rgba(11, 20, 26, 0)');
      } else if (isListening) {
        glowGrad.addColorStop(0, 'rgba(52, 211, 153, 0.40)');
        glowGrad.addColorStop(0.5, 'rgba(16, 185, 129, 0.15)');
        glowGrad.addColorStop(1, 'rgba(11, 20, 26, 0)');
      } else {
        glowGrad.addColorStop(0, 'rgba(168, 85, 247, 0.35)');
        glowGrad.addColorStop(0.5, 'rgba(99, 102, 241, 0.12)');
        glowGrad.addColorStop(1, 'rgba(11, 20, 26, 0)');
      }
      ctx.fillStyle = glowGrad;
      ctx.fillRect(0, 0, width, height);

      // 2. Orbiting 3D Gyroscope Planetary Rings
      const ringCount = 3;
      for (let r = 0; r < ringCount; r++) {
        ctx.save();
        ctx.translate(centerX, centerY);
        ctx.rotate(pulse * (r === 1 ? -0.4 : 0.55) + (r * Math.PI) / 3);
        ctx.beginPath();
        ctx.ellipse(0, 0, 110 * dynamicRadiusScale, 42 * dynamicRadiusScale, (r * Math.PI) / 4, 0, Math.PI * 2);
        ctx.strokeStyle = isSpeaking
          ? `rgba(56, 189, 248, ${0.45 - r * 0.1})`
          : isListening
          ? `rgba(52, 211, 153, ${0.42 - r * 0.1})`
          : `rgba(168, 85, 247, ${0.35 - r * 0.1})`;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.restore();
      }

      // 3. 3D Spherical Particle Cloud
      const cosX = Math.cos(angleX);
      const sinX = Math.sin(angleX);
      const cosY = Math.cos(angleY);
      const sinY = Math.sin(angleY);

      const projected = particles.map(p => {
        let x1 = p.x * cosY - p.z * sinY;
        let z1 = p.z * cosY + p.x * sinY;
        let y2 = p.y * cosX - z1 * sinX;
        let z2 = z1 * cosX + p.y * sinX;

        const scale = 250 / (250 + z2);
        return {
          px: centerX + x1 * scale * dynamicRadiusScale,
          py: centerY + y2 * scale * dynamicRadiusScale,
          scale,
          z2,
          color: p.color,
          size: p.size * scale,
        };
      });

      projected.sort((a, b) => a.z2 - b.z2);

      projected.forEach(p => {
        const alpha = Math.max(0.18, Math.min(1, (p.z2 + 120) / 240));
        ctx.beginPath();
        ctx.arc(p.px, p.py, p.size, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = alpha;
        ctx.shadowColor = p.color;
        ctx.shadowBlur = isSpeaking ? 12 : 6;
        ctx.fill();
      });
      ctx.globalAlpha = 1.0;
      ctx.shadowBlur = 0;

      // 4. Live Audio Equalizer Frequency Bars
      const barCount = 28;
      const barWidth = 3.5;
      const gap = 3.5;
      const totalWidth = barCount * (barWidth + gap);
      const startX = centerX - totalWidth / 2;
      const baseY = centerY + 130;

      for (let b = 0; b < barCount; b++) {
        const wave = Math.sin(pulse * 3 + b * 0.4);
        let barHeight = isSpeaking
          ? 8 + Math.abs(wave) * 30
          : isListening
          ? 6 + Math.abs(Math.sin(pulse * 1.5 + b * 0.3)) * 18
          : 4 + Math.abs(Math.sin(pulse * 0.8 + b * 0.2)) * 7;

        const bx = startX + b * (barWidth + gap);
        const by = baseY - barHeight / 2;

        const barGrad = ctx.createLinearGradient(0, by, 0, by + barHeight);
        if (isSpeaking) {
          barGrad.addColorStop(0, '#38BDF8');
          barGrad.addColorStop(1, '#818CF8');
        } else if (isListening) {
          barGrad.addColorStop(0, '#34D399');
          barGrad.addColorStop(1, '#10B981');
        } else {
          barGrad.addColorStop(0, '#C084FC');
          barGrad.addColorStop(1, '#6366F1');
        }

        ctx.fillStyle = barGrad;
        ctx.beginPath();
        if (ctx.roundRect) {
          ctx.roundRect(bx, by, barWidth, barHeight, 2);
        } else {
          ctx.rect(bx, by, barWidth, barHeight);
        }
        ctx.fill();
      }

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => {
      if (animId) cancelAnimationFrame(animId);
    };
  }, [visible, isVideoMode, aiSpeechState]);

  // Main Call Activation Lifecycle
  useEffect(() => {
    if (visible) {
      isCallActiveRef.current = true;
      setCallDuration(0);
      setCallStatus('Connected');
      setIsMicMuted(false);
      configureAudioRoute(isVideoMode);

      timerRef.current = setInterval(() => {
        setCallDuration(prev => prev + 1);
      }, 1000);

      setupMediaStream();

      // Initial reassuring greeting using Mansakha
      const greeting = "Hello, I am Mansakha. I am right here with you. Please take your time and speak freely.";

      const t = setTimeout(() => {
        speakText(greeting, () => {
          if (isCallActiveRef.current) {
            startListening();
          }
        });
      }, 600);

      return () => clearTimeout(t);
    } else {
      isCallActiveRef.current = false;
      if (timerRef.current) clearInterval(timerRef.current);
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch (_) {}
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }
      if (userVideoStreamRef.current) {
        userVideoStreamRef.current.getTracks().forEach(t => t.stop());
      }
      if (avatarControllerRef.current) {
        avatarControllerRef.current.dispose();
        avatarControllerRef.current = null;
      }
      if (Platform.OS === 'web' && typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    }
  }, [visible, counsellorGender]);

  // Toggle Mic
  const toggleMic = () => {
    setIsMicMuted(prev => {
      const next = !prev;
      if (streamRef.current) {
        streamRef.current.getAudioTracks().forEach(t => {
          t.enabled = !next;
        });
      }
      if (next) {
        if (recognitionRef.current) {
          try { recognitionRef.current.stop(); } catch (_) {}
        }
        setCallStatus('Microphone muted');
      } else {
        setCallStatus('Connected');
        if (aiSpeechState === 'listening') {
          startListening();
        }
      }
      return next;
    });
  };

  // End Call
  const handleEndCall = () => {
    isCallActiveRef.current = false;
    if (timerRef.current) clearInterval(timerRef.current);
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch (_) {}
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
    }
    if (userVideoStreamRef.current) {
      userVideoStreamRef.current.getTracks().forEach(t => t.stop());
    }
    if (avatarControllerRef.current) {
      avatarControllerRef.current.dispose();
      avatarControllerRef.current = null;
    }
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    onEndCall();
  };

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      statusBarTranslucent={true}
      onRequestClose={handleEndCall}
    >
      <View style={styles.fullScreenOverlay}>
        {/* Tier 0: Full Screen 3D Avatar (Rendered only when Video Call is activated) */}
        {isVideoMode && (
          Platform.OS === 'web'
            ? <div ref={avatar3dContainerRef} style={styles.fullscreenAvatarContainer} />
            : <AvatarGLView ref={avatarControllerRef} style={styles.fullscreenAvatarContainer} />
        )}

        {/* Tier 1: Top Header Bar (Floating over avatar / voice screen) */}
        <View style={styles.topHeaderBar}>
          <View style={styles.encryptionPill}>
            <Feather name="lock" size={10} color="rgba(255, 255, 255, 0.75)" />
            <Text style={styles.encryptionText}>
              {isVideoMode ? 'Encrypted Video Call (Speaker)' : 'Encrypted Voice Call (Earpiece)'}
            </Text>
          </View>

          {/* Consistent Mansakha Title */}
          <Text style={styles.callerNameText}>Mansakha</Text>

          <Text style={styles.callTimerText}>
            {callStatus} • {formatTime(callDuration)}
          </Text>

          {/* Gender Switcher (Clean, no emojis) */}
          <View style={styles.genderToggleContainer}>
            <Pressable
              style={[
                styles.genderToggleTab,
                counsellorGender === 'male' && styles.genderToggleTabActive,
              ]}
              onPress={() => setCounsellorGender('male')}
              accessibilityLabel="Male Counsellor"
              hitSlop={6}
            >
              <Text style={[styles.genderToggleText, counsellorGender === 'male' && styles.genderToggleTextActive]}>
                Male
              </Text>
            </Pressable>

            <Pressable
              style={[
                styles.genderToggleTab,
                counsellorGender === 'female' && styles.genderToggleTabActive,
              ]}
              onPress={() => setCounsellorGender('female')}
              accessibilityLabel="Female Counsellor"
              hitSlop={6}
            >
              <Text style={[styles.genderToggleText, counsellorGender === 'female' && styles.genderToggleTextActive]}>
                Female
              </Text>
            </Pressable>
          </View>
        </View>

        {/* Tier 2: Center Stage (3D Hologram Particle Sphere in Voice Call; User PiP in Video Call) */}
        <View style={styles.centerStage} pointerEvents="box-none">
          {!isVideoMode && Platform.OS === 'web' && (
            <canvas ref={canvasRef} style={styles.voiceHologramCanvas} />
          )}

          {/* Floating Picture-in-Picture Card for User (WhatsApp Style in bottom-right corner) */}
          {isVideoMode && hasCameraFeed && Platform.OS === 'web' && (
            <View style={styles.userPipCornerContainer}>
              <video
                ref={userVideoRef}
                autoPlay
                playsInline
                muted
                style={styles.pipVideoElement}
              />
              <Pressable style={styles.pipFlipBtn} onPress={flipCamera} hitSlop={8} accessibilityLabel="Flip camera">
                <Feather name="refresh-cw" size={10} color="#FFF" />
              </Pressable>
              <View style={styles.pipLabelBadge}>
                <Text style={styles.pipLabelText}>You</Text>
              </View>
            </View>
          )}
        </View>

        {/* Tier 3: Live Subtitles Strip */}
        <View style={styles.subtitlesSection}>
          <View style={styles.captionSpeakerRow}>
            <View
              style={[
                styles.speakerDot,
                {
                  backgroundColor:
                    aiSpeechState === 'speaking'
                      ? '#38BDF8'
                      : aiSpeechState === 'listening'
                      ? '#34D399'
                      : '#C084FC',
                },
              ]}
            />
            <Text style={styles.speakerLabel}>
              Mansakha AI {aiSpeechState === 'speaking' ? '(Speaking...)' : aiSpeechState === 'listening' ? '(Listening...)' : '(Reflecting...)'}
            </Text>
          </View>
          <Text style={styles.captionBodyText} numberOfLines={2}>
            {aiSpeechState === 'speaking'
              ? (captions || "I'm right here with you.")
              : aiSpeechState === 'thinking'
              ? 'Reflecting on what you shared...'
              : 'Listening closely. Please take your time and speak freely.'}
          </Text>
        </View>

        {/* Tier 4: Quick Expression Chips */}
        <View style={styles.quickChipsContainer}>
          {["I feel overwhelmed", "I am feeling anxious", "I'm doing a bit better"].map((phrase) => (
            <Pressable
              key={phrase}
              style={styles.quickChip}
              onPress={() => handleUserSpeech(phrase)}
            >
              <Text style={styles.quickChipText}>{phrase}</Text>
            </Pressable>
          ))}
        </View>

        {/* Tier 5: Bottom WhatsApp Call Controls */}
        <View style={styles.bottomControlsBar}>
          {/* Toggle Mic */}
          <Pressable
            style={[styles.controlCircleBtn, isMicMuted && styles.controlCircleBtnMuted]}
            onPress={toggleMic}
            accessibilityLabel={isMicMuted ? "Unmute Microphone" : "Mute Microphone"}
            hitSlop={8}
          >
            <Feather name={isMicMuted ? "mic-off" : "mic"} size={22} color="#FFF" />
          </Pressable>

          {/* Toggle Video Call (Switches between Voice Earpiece & Video Loudspeaker Avatar) */}
          <Pressable
            style={[styles.controlCircleBtn, isVideoMode && styles.controlCircleBtnActive]}
            onPress={toggleVideoMode}
            accessibilityLabel={isVideoMode ? "Switch to Voice Call" : "Switch to Video Call"}
            hitSlop={8}
          >
            <Feather name={isVideoMode ? "video" : "video-off"} size={22} color="#FFF" />
          </Pressable>

          {/* End Call Button (Large Red Circular WhatsApp Button) */}
          <Pressable style={styles.endCallCircleBtn} onPress={handleEndCall} accessibilityLabel="End Call" hitSlop={8}>
            <Feather name="phone-off" size={24} color="#FFF" />
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fullScreenOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100vw',
    height: '100dvh',
    minHeight: '100%',
    backgroundColor: '#0B141A',
    zIndex: 999999,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'web' ? 12 : 20,
    paddingBottom: Platform.OS === 'web' ? 12 : 24,
    overflow: 'hidden',
  },
  topHeaderBar: {
    flexShrink: 0,
    alignItems: 'center',
    zIndex: 20,
    paddingBottom: 4,
  },
  encryptionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: radius.pill,
    marginBottom: 6,
  },
  encryptionText: {
    color: 'rgba(255, 255, 255, 0.75)',
    fontSize: 11,
    fontWeight: '500',
  },
  callerNameText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  callTimerText: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 1,
    marginBottom: 6,
  },
  genderToggleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: radius.pill,
    padding: 2,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  genderToggleTab: {
    paddingHorizontal: 12,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  genderToggleTabActive: {
    backgroundColor: '#7C5CBF',
    boxShadow: '0 2px 8px rgba(37, 99, 235, 0.45)',
  },
  genderToggleText: {
    color: 'rgba(255, 255, 255, 0.65)',
    fontSize: 11,
    fontWeight: '600',
  },
  genderToggleTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  centerStage: {
    flex: 1,
    minHeight: 0,
    width: '100%',
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  voiceCallCenterStage: {
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  voiceRippleOuter: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(56, 189, 248, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  voiceRippleInner: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: 'rgba(30, 58, 138, 0.6)',
    borderWidth: 1.5,
    borderColor: 'rgba(56, 189, 248, 0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 0 20px rgba(56, 189, 248, 0.25)',
  },
  voiceHologramCanvas: {
    width: 360,
    height: 360,
    maxWidth: '94vw',
    maxHeight: 380,
    aspectRatio: 1,
    alignSelf: 'center',
    display: 'block',
  },
  fullscreenAvatarContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100vw',
    height: '100dvh',
    zIndex: 0,
    overflow: 'hidden',
    backgroundColor: '#0B141A',
  },
  userPipCornerContainer: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    width: 72,
    height: 98,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#1E293B',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    boxShadow: '0 4px 16px rgba(0, 0, 0, 0.6)',
    zIndex: 50,
  },
  pipVideoElement: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  pipFlipBtn: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pipLabelBadge: {
    position: 'absolute',
    bottom: 4,
    left: 4,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
  },
  pipLabelText: {
    color: '#FFF',
    fontSize: 8,
    fontWeight: '700',
  },
  subtitlesSection: {
    flexShrink: 0,
    width: '100%',
    maxWidth: 400,
    alignSelf: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.88)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    backdropFilter: 'blur(16px)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    boxShadow: '0 4px 16px rgba(0, 0, 0, 0.4)',
    marginVertical: 4,
    zIndex: 15,
  },
  captionSpeakerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 2,
  },
  speakerDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  speakerLabel: {
    color: '#94A3B8',
    fontSize: 9,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  captionBodyText: {
    color: '#F8FAFC',
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
  },
  quickChipsContainer: {
    flexShrink: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: 5,
    marginBottom: 6,
    zIndex: 10,
    width: '100%',
    maxWidth: 400,
    alignSelf: 'center',
  },
  quickChip: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  quickChipText: {
    color: '#E2E8F0',
    fontSize: 10,
    fontWeight: '600',
  },
  bottomControlsBar: {
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    backgroundColor: 'rgba(20, 32, 44, 0.92)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    backdropFilter: 'blur(16px)',
    alignSelf: 'center',
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 30,
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
    zIndex: 20,
  },
  controlCircleBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  controlCircleBtnActive: {
    backgroundColor: '#7C5CBF',
  },
  controlCircleBtnMuted: {
    backgroundColor: '#EF4444',
  },
  endCallCircleBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#EA0038',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 4px 16px rgba(234, 0, 56, 0.4)',
  },
});
