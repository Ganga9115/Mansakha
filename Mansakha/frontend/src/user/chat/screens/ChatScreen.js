import React, { useRef, useState, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, FlatList, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { colors } from '../../shared/theme/colors';
import { spacing } from '../../shared/theme/spacing';
import { radius } from '../../shared/theme/radius';
import { typography } from '../../shared/theme/typography';
import { formContentWidth } from '../../shared/theme/layout';
import { useResponsive } from '../../shared/hooks/useResponsive';
import Svg, { Path } from 'react-native-svg';
import TopRightActions from '../../shared/components/TopRightActions';
import { useCheckin, useLogChatTurn } from '../../shared/services/hooks';
import MansakhaCallModal from '../components/MansakhaCallModal';

const OLLAMA = "http://127.0.0.1:11434";
const CHAT = OLLAMA + "/api/chat";
const TAGS = OLLAMA + "/api/tags";

const SYSTEM = `You are Mansakha, a warm, compassionate, and attentive conversational companion for individuals navigating distress or trauma under India's SC/ST (Prevention of Atrocities) Act. You are NOT an intake counselor, an interviewer, or a Q&A bot.

Follow these conversational boundaries strictly:

1. BREAK THE INTERROGATION PATTERN:
- Do NOT end every message with a question.
- In most turns, ask NO questions at all. Simply sit with what the user shared, validate their feelings, or offer a comforting, calming reflection.
- A supportive conversation is about presence and active listening, not continuous questioning.

2. NEVER REPEAT QUESTIONS OR USE GENERIC PROMPTS:
- Never ask repetitive filler questions like:
  * "Can you tell me more about that?"
  * "How does that make you feel?"
  * "What's on your mind?"
  * "Would you like to explore that further?"
- If you asked a question in a previous turn, do NOT ask another one in the next turn. Let the user guide the direction.
- Only ask a question if the user explicitly opens a specific story or topic, and make it deeply specific to what they just said—never a generic prompt.

3. ELIMINATE THERAPIST CLICHÉS:
- Never use formulaic, clinical phrases such as:
  * "I hear you..."
  * "Thank you for being so brave and sharing that with me..."
  * "It takes a lot of courage to admit that..."
- Speak naturally, like an empathetic friend who cares, not an automated support ticket or psychiatric screening bot.

4. VARY YOUR CONVERSATIONAL CADENCE:
- Mode A (Empathetic Reflection): Simply acknowledge how heavy or real their experience is without demanding more information from them.
- Mode B (Gentle Grounding): Offer a calm perspective, reminding them it is okay to feel depleted, rest, or take things one moment at a time.
- Mode C (Organic Interaction): Respond directly to what was said with genuine human resonance.

5. CONCISENESS & FLOW:
- Keep replies strictly between 2 to 3 sentences.
- Never lecture, preach, or offer unsolicited step-by-step solutions unless they ask for advice.

6. LANGUAGE CONSISTENCY:
- Always reply entirely in the exact language the user used (e.g., pure English, pure Hindi, pure Tamil, etc.). Never mix languages or switch to another language.

7. NO FORENSIC SCRUTINY OR CROSS-EXAMINATION:
- Never interrogate, cross-examine, or ask for evidence, proof, or timeline justifications.

8. NO TOXIC POSITIVITY:
- Never minimize suffering with platitudes such as "Everything happens for a reason" or "Look on the bright side".

9. NO FALSE LEGAL GUARANTEES:
- Never make guarantees about specific court sentences, convictions, or compensation dates.

10. NO PSYCHIATRIC LABELS:
- Do not label the user with clinical disorders. Normalize their emotions as understandable human responses to immense hardship.

11. PRESERVE DIGNITY & AGENCY:
- Never condescend to the user or treat them as helpless. Empower their own choices and emotional pace.`;

function Bubble({ message }) {
  const isUser = message.role === 'user';
  return (
    <View style={[styles.bubbleRow, isUser && styles.bubbleRowUser]}>
      <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleAi]}>
        <Text style={[styles.bubbleRole, isUser && { color: 'rgba(255,255,255,0.8)' }]}>
          {isUser ? 'YOU' : 'MANSAKHA'}
        </Text>
        <Text style={[styles.bubbleText, isUser && styles.bubbleTextUser]}>
          {message.content}
        </Text>
      </View>
    </View>
  );
}

export default function ChatScreen({ navigation }) {
  const { tier } = useResponsive();
  const insets = useSafeAreaInsets();
  const submitMutation = useCheckin();
  const logChatTurn = useLogChatTurn();
  const [model, setModel] = useState('gemma3:4b');
  const [models, setModels] = useState([]);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [status, setStatus] = useState('Connecting to Ollama...');

  // Live Voice Call State
  const [inCall, setInCall] = useState(false);
  const [isCallModalVisible, setIsCallModalVisible] = useState(false);
  const [voiceState, setVoiceState] = useState('Ready to talk');

  // Layout Toggle & Recording States
  const [showExpandedMenu, setShowExpandedMenu] = useState(false);
  const [showRecorderBox, setShowRecorderBox] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioBlob, setAudioBlob] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null);

  // Refs
  const videoRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const recordTimerRef = useRef(null);
  const audioElementRef = useRef(null);
  const listRef = useRef(null);

  useEffect(() => {
    loadModels();
    return () => {
      stopMediaStream();
      if (recordTimerRef.current) clearInterval(recordTimerRef.current);
    };
  }, []);

  const stopMediaStream = () => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }
  };

  const loadModels = async () => {
    try {
      const r = await fetch(TAGS);
      if (!r.ok) throw new Error(r.status);
      const d = await r.json();
      const availableModels = d.models || [];
      setModels(availableModels.map(m => m.name));
      if (availableModels.length > 0) {
        setModel(availableModels[0].name);
        setStatus(`● Ollama connected • ${availableModels[0].name}`);
      } else {
        setStatus("✕ No models found in Ollama.");
      }
    } catch (e) {
      setStatus("✕ Cannot connect to Ollama. Ensure Ollama is running.");
    }
  };

  const askOllama = async (text, currentMsgs) => {
    const newMessages = [...currentMsgs, { role: "user", content: text }];
    setMessages(newMessages);

    try {
      const r = await fetch(CHAT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: model,
          stream: false,
          messages: [{ role: "system", content: SYSTEM }, ...newMessages],
          options: { temperature: 0.5 }
        })
      });
      if (!r.ok) throw new Error(await r.text());
      const d = await r.json();
      const reply = d?.message?.content?.trim();
      if (!reply) throw new Error("Empty response");

      setMessages(prev => [...prev, { role: "assistant", content: reply }]);
      setStatus(`● Connected • ${model}`);

      logChatTurn.mutate({ userMessage: text, aiMessage: reply });
      return reply;
    } catch (e) {
      setMessages(currentMsgs);
      setStatus("✕ Ollama error: " + e.message);
      throw e;
    }
  };

  const handleSend = async () => {
    if (isRecording) {
      stopVoiceRecording();
    }

    if (audioBlob || audioUrl || isRecording) {
      const activeBlob = audioBlob;
      const recTime = recordingTime;
      deleteRecording();
      setStatus("Transcribing with IIT Madras Speech Lab ASR & Analyzing Voice Stress...");

      if (activeBlob && Platform.OS === 'web') {
        try {
          const reader = new FileReader();
          reader.readAsDataURL(activeBlob);
          reader.onloadend = async () => {
            const base64Data = reader.result.includes(',') ? reader.result.split(',')[1] : reader.result;
            try {
              const res = await fetch("http://127.0.0.1:8000/api/ai/multimodal/", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ audio_base64: base64Data }),
              });

              let textToSend = `🎤 Voice Note (${recTime}s)`;
              if (res.ok) {
                const data = await res.json();
                const transcript = data.transcript?.trim();
                const stress = data.voice_stress_score;
                const stressPct = Math.round((stress || 0) * 100);
                if (transcript) {
                  textToSend = `🎤 "${transcript}" [Voice Stress: ${stressPct}%]`;
                }
              }

              await askOllama(textToSend, messages);
              requestAnimationFrame(() => listRef.current?.scrollToEnd?.({ animated: true }));
            } catch (networkErr) {
              console.warn("Could not reach Django AI backend, using fallback:", networkErr);
              const fallbackText = `🎤 [Voice Note - ${recTime}s]`;
              await askOllama(fallbackText, messages);
              requestAnimationFrame(() => listRef.current?.scrollToEnd?.({ animated: true }));
            }
          };
        } catch (err) {
          const fallbackText = `🎤 [Voice Note - ${recTime}s]`;
          await askOllama(fallbackText, messages);
        }
      } else {
        const fallbackText = `🎤 [Voice Note - ${recTime}s]`;
        await askOllama(fallbackText, messages);
      }
      return;
    }

    const text = draft.trim();
    if (!text) return;
    setDraft('');
    setStatus("Mansakha is thinking...");
    try {
      await askOllama(text, messages);
      requestAnimationFrame(() => listRef.current?.scrollToEnd?.({ animated: true }));
    } catch (err) {}
  };

  const toggleVoiceCall = () => {
    setIsCallModalVisible(true);
    setInCall(true);
  };

  const endCall = () => {
    setIsCallModalVisible(false);
    setInCall(false);
    setStatus(`● Connected • ${model}`);
  };

  // Toggle vertical box state on click
  const handleRecorderClick = () => {
    if (showRecorderBox) {
      setShowRecorderBox(false);
    } else {
      setShowRecorderBox(true);
      if (!isRecording && !audioUrl) {
        startVoiceRecording();
      }
    }
  };

  // Voice Recorder Controls
  const startVoiceRecording = async () => {
    deleteRecording();
    if (Platform.OS !== 'web' || !navigator.mediaDevices?.getUserMedia) {
      setIsRecording(true);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = () => {
        stream.getTracks().forEach(track => track.stop());
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const url = URL.createObjectURL(blob);
        setAudioBlob(blob);
        setAudioUrl(url);
        setIsRecording(false);
        setIsPaused(false);
        clearInterval(recordTimerRef.current);
      };

      mediaRecorder.start();
      setIsRecording(true);
      setIsPaused(false);
      setRecordingTime(0);
      recordTimerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } catch (err) {
      alert("Microphone permission denied: " + err.message);
    }
  };

  const pauseVoiceRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      if (isPaused) {
        mediaRecorderRef.current.resume();
        setIsPaused(false);
        recordTimerRef.current = setInterval(() => {
          setRecordingTime(prev => prev + 1);
        }, 1000);
      } else {
        mediaRecorderRef.current.pause();
        setIsPaused(true);
        clearInterval(recordTimerRef.current);
      }
    }
  };

  const stopVoiceRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
    } else {
      setIsRecording(false);
    }
  };

  const togglePlayback = () => {
    if (!audioUrl) return;
    if (!audioElementRef.current) {
      audioElementRef.current = new Audio(audioUrl);
      audioElementRef.current.onended = () => setIsPlaying(false);
    }

    if (isPlaying) {
      audioElementRef.current.pause();
      setIsPlaying(false);
    } else {
      audioElementRef.current.play();
      setIsPlaying(true);
    }
  };

  const deleteRecording = () => {
    if (audioElementRef.current) {
      audioElementRef.current.pause();
      audioElementRef.current = null;
    }
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
    }
    clearInterval(recordTimerRef.current);
    setIsRecording(false);
    setIsPaused(false);
    setIsPlaying(false);
    setAudioBlob(null);
    setAudioUrl(null);
    setRecordingTime(0);
    setShowRecorderBox(false);
  };

  const isSendActive = draft.trim().length > 0;

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {/* Top Header */}
      <View style={[styles.topHeader, tier !== 'desktop' && { paddingTop: insets.top + spacing.xs, paddingBottom: spacing.sm }]}>
        {tier !== 'desktop' && (
          <Pressable onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={8}>
            <Feather name="arrow-left" size={20} color={colors.primaryDark} />
          </Pressable>
        )}
        <View style={styles.headerIconTile}>
          <Feather name="cpu" size={18} color={colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.statusTitle}>Mansakha AI Counsellor</Text>
          <Text style={styles.subtext}>{inCall ? voiceState : status}</Text>
        </View>
        <TopRightActions />
      </View>

      <View style={[styles.body, { maxWidth: formContentWidth[tier], width: '100%', alignSelf: 'center', paddingTop: spacing.md }]}>
        {/* WhatsApp-Style Fullscreen 3D Animated Voice Call Modal */}
        <MansakhaCallModal
          visible={isCallModalVisible}
          onEndCall={endCall}
          onNewMessage={(msg) => {
            setMessages(prev => [...prev, msg]);
            if (msg.role === 'assistant') {
              const lastUserMsg = messages[messages.length - 1]?.content || 'Live spoken query';
              logChatTurn.mutate({ userMessage: lastUserMsg, aiMessage: msg.content });
            }
          }}
        />

        {/* Message Stream */}
        <FlatList
          ref={listRef}
          data={messages}
          showsVerticalScrollIndicator={false}
          keyExtractor={(_, i) => i.toString()}
          renderItem={({ item }) => <Bubble message={item} />}
          contentContainerStyle={styles.listContent}
        />

        {/* Dynamic Action Input Panel */}
        <View style={styles.inputSectionContainer}>
          <View style={styles.singleInputWrapper}>
            {/* Live AI Call Floating Button centered at top of textbox */}
            <Pressable
              style={styles.floatingCallTriggerBtn}
              onPress={toggleVoiceCall}
              accessibilityLabel="Start Live Call with Mansakha AI"
            >
              <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
                <Path
                  d="M12 2C12 7.52285 7.52285 12 2 12C7.52285 12 12 16.4772 12 22C12 16.4772 16.4772 12 22 12C16.4772 12 12 7.52285 12 2Z"
                  fill="#FFFFFF"
                />
              </Svg>
            </Pressable>

            <View style={styles.textInputRow}>
              <TextInput
                style={styles.textInput}
                placeholder="Type a message..."
                placeholderTextColor={colors.textSecondary}
                value={draft}
                onChangeText={setDraft}
                onKeyPress={(e) => {
                  if (Platform.OS === 'web' && e.nativeEvent.key === 'Enter' && !e.nativeEvent.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                multiline
              />

              {/* Universal Send Button */}
              <Pressable
                style={[styles.sendBtn, !isSendActive && styles.sendBtnDisabled]}
                onPress={handleSend}
                disabled={!isSendActive}
                hitSlop={6}
              >
                <Feather name="send" size={18} color={colors.white} />
              </Pressable>
            </View>
          </View>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  topHeader: {
    backgroundColor: colors.primaryLight,
    paddingTop: spacing.xxl,
    paddingBottom: spacing.lg,
    paddingHorizontal: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  headerPhoneBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.xs,
  },
  backBtn: { padding: spacing.xs, marginRight: spacing.sm },
  headerIconTile: {
    width: 36, height: 36, borderRadius: radius.pill, backgroundColor: colors.surface,
    alignItems: 'center', justifyContent: 'center', marginRight: spacing.sm
  },
  statusTitle: { ...typography.h3, color: colors.primaryDark },
  subtext: { ...typography.caption, color: colors.textSecondary },
  body: { flex: 1, paddingHorizontal: spacing.lg },
  listContent: { paddingBottom: spacing.xl },
  bubbleRow: { flexDirection: 'row', marginBottom: spacing.sm },
  bubbleRowUser: { justifyContent: 'flex-end' },
  bubble: { maxWidth: '80%', borderRadius: radius.lg, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  bubbleAi: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderTopLeftRadius: 4 },
  bubbleUser: { backgroundColor: colors.primary, borderTopRightRadius: 4 },
  bubbleRole: { fontSize: 10, fontWeight: 'bold', opacity: 0.65, marginBottom: 4, color: colors.textPrimary },
  bubbleText: { ...typography.body, color: colors.textPrimary },
  bubbleTextUser: { color: colors.white },


  inputSectionContainer: {
    marginBottom: spacing.md,
    position: 'relative',
  },

  /* Compact Vertical Recorder Box Overlay (Icons Only) */
  verticalRecorderBox: {
    position: 'absolute',
    bottom: 56,
    right: 48,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 5,
    alignItems: 'center',
    zIndex: 20,
  },
  recorderTimerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
    gap: 6,
  },
  recordingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.danger,
  },
  recordingTimeText: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  verticalActionsContainer: {
    flexDirection: 'column',
    gap: spacing.xs,
  },
  verticalActionIconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },

  singleInputWrapper: {
    position: 'relative',
    paddingTop: 16,
  },
  floatingCallTriggerBtn: {
    position: 'absolute',
    top: -4,
    alignSelf: 'center',
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#1E3A8A',
    borderWidth: 3,
    borderColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
  },
  textInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 24,
    paddingLeft: 16,
    paddingRight: 12,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  textInput: {
    flex: 1, ...typography.body, color: colors.textPrimary,
    maxHeight: 100, paddingRight: 8,
    paddingTop: Platform.OS === 'web' ? 10 : 8,
    paddingBottom: Platform.OS === 'web' ? 10 : 8,
    outlineStyle: 'none',
  },
  sendBtn: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center', marginLeft: 4,
  },
  sendBtnDisabled: { opacity: 0.5 },
});