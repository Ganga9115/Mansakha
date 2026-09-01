import React, { useRef, useState, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, FlatList, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors } from '../../shared/theme/colors';
import { spacing } from '../../shared/theme/spacing';
import { radius } from '../../shared/theme/radius';
import { typography } from '../../shared/theme/typography';
import { formContentWidth } from '../../shared/theme/layout';
import { useResponsive } from '../../shared/hooks/useResponsive';
import TopRightActions from '../../shared/components/TopRightActions';
import { useCheckin } from '../../shared/services/hooks';
import { analyzeConversation } from '../../shared/services/ollamaClient';
const OLLAMA = "http://127.0.0.1:11434";
const CHAT = OLLAMA + "/api/chat";
const TAGS = OLLAMA + "/api/tags";
const SYSTEM = `You are Mansakha, a calm and supportive conversational companion. Listen with empathy. Keep replies short and natural. Ask one gentle question at a time. Do not diagnose mental-health conditions. Do not assign risk levels or distress scores. Do not claim to be a doctor, counsellor, lawyer or police officer. Do not claim you contacted anyone. A separate post-conversation distress analysis handles distress scoring. If immediate danger is described, do not ask same question again and again, encourage immediate local emergency help.`;

function Bubble({ message }) {
  const isUser = message.role === 'user';
  return (
    <View style={[styles.bubbleRow, isUser && styles.bubbleRowUser]}>
      <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleAi]}>
        <Text style={[styles.bubbleRole, isUser && { color: 'rgba(255,255,255,0.8)' }]}>{isUser ? 'YOU' : 'MANSAKHA'}</Text>
        <Text style={[styles.bubbleText, isUser && styles.bubbleTextUser]}>{message.content}</Text>
      </View>
    </View>
  );
}

export default function ChatScreen({ navigation }) {
  const { tier } = useResponsive();
  const submitMutation = useCheckin();
  const [model, setModel] = useState('gemma3:4b');
  const [models, setModels] = useState([]);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [status, setStatus] = useState('Connecting to Ollama...');

  // Voice Call state - triggered from the composer's mic button (see
  // toggleCall below), not a separate tab/mode anymore. Recognized speech
  // and spoken replies flow into the same `messages` array as typed text,
  // so a call's turns render as ordinary bubbles in the one chat thread.
  const [inCall, setInCall] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [voiceState, setVoiceState] = useState('Ready to talk');
  const recognitionRef = useRef(null);
  // Set once a call happens this session - read by analyzeDistress to
  // decide whether to report this check-in as 'IVRS' or 'Chatbot', now that
  // there's no explicit mode toggle to read that from.
  const usedVoiceRef = useRef(false);

  // Analysis State
  const [analysis, setAnalysis] = useState(null);

  const listRef = useRef(null);
  
  useEffect(() => {
    loadModels();
  }, []);

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
      return reply;
    } catch (e) {
      setMessages(currentMsgs); // revert
      setStatus("✕ Ollama error: " + e.message);
      throw e;
    }
  };

  const handleSendText = async () => {
    const text = draft.trim();
    if (!text) return;
    setDraft('');
    setStatus("Mansakha is thinking...");
    try {
      await askOllama(text, messages);
      requestAnimationFrame(() => listRef.current?.scrollToEnd?.({ animated: true }));
    } catch (err) {
      // error handled in askOllama
    }
  };

  // --- Voice Logic (Web Only for Prototype) ---
  const getVoice = () => {
    if (!window.speechSynthesis) return null;
    const voices = window.speechSynthesis.getVoices();
    const preferred = [
      "Microsoft Aria Online (Natural) - English (India)",
      "Microsoft Heera - English (India)",
      "Google English",
      "Samantha",
      "Microsoft Zira"
    ];
    return voices.find(v => preferred.some(p => v.name.includes(p))) ||
           voices.find(v => v.lang.toLowerCase().startsWith("en-in")) ||
           voices.find(v => v.lang.toLowerCase().startsWith("en")) ||
           voices[0];
  };

  const speak = (text) => {
    return new Promise(res => {
      if (!window.speechSynthesis) return res();
      setSpeaking(true);
      setVoiceState("Speaking...");
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      const v = getVoice();
      if (v) u.voice = v;
      u.lang = v?.lang || "en-IN";
      u.rate = 0.9;
      u.onend = u.onerror = () => {
        setSpeaking(false);
        res();
      };
      window.speechSynthesis.speak(u);
    });
  };

  const makeRecognition = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return null;
    const r = new SR();
    r.continuous = false;
    r.interimResults = true;
    r.lang = "en-IN";
    r.onstart = () => {
      if (inCallRef.current) {
        setVoiceState("Listening...");
        setStatus("● Microphone active");
      }
    };
    r.onspeechstart = () => {
      if (speakingRef.current) {
        window.speechSynthesis?.cancel();
        setSpeaking(false);
        setVoiceState("Listening...");
      }
    };
    r.onresult = e => {
      let f = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) f += e.results[i][0].transcript;
      }
      if (f.trim()) {
        if (speakingRef.current) {
          window.speechSynthesis?.cancel();
          setSpeaking(false);
          setVoiceState("Listening...");
        }
        handleVoiceInput(f.trim());
      }
    };
    r.onerror = e => {
      if (inCallRef.current && e.error !== "not-allowed") {
        setTimeout(startListening, 500);
      } else if (e.error === "not-allowed") {
        setStatus("Allow microphone access.");
      }
    };
    r.onend = () => {
      if (inCallRef.current) {
        setTimeout(startListening, 300);
      }
    };
    return r;
  };

  // We need refs inside callbacks since speech API uses old closures
  const inCallRef = useRef(inCall);
  const speakingRef = useRef(speaking);
  inCallRef.current = inCall;
  speakingRef.current = speaking;
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  const startListening = () => {
    if (!inCallRef.current) return;
    if (!recognitionRef.current) {
      recognitionRef.current = makeRecognition();
    }
    if (!recognitionRef.current) {
      setStatus("Speech recognition unavailable.");
      return;
    }
    try {
      recognitionRef.current.start();
    } catch (e) {}
  };

  const stopListening = () => {
    try {
      recognitionRef.current?.stop();
    } catch (e) {}
  };

  const handleVoiceInput = async (text) => {
    if (!inCallRef.current) return;
    stopListening();
    setStatus("Mansakha is thinking...");
    try {
      const reply = await askOllama(text, messagesRef.current);
      await speak(reply);
      if (inCallRef.current) {
        setTimeout(startListening, 250);
      }
    } catch (e) {
      setVoiceState("Connection problem");
      if (inCallRef.current) setTimeout(startListening, 1000);
    }
  };

  const toggleCall = async () => {
    if (Platform.OS !== 'web') {
      alert("Voice input requires a web browser in this prototype.");
      return;
    }
    if (inCall) {
      setInCall(false);
      window.speechSynthesis?.cancel();
      stopListening();
      setVoiceState("Call ended");
      setTimeout(analyzeDistress, 150);
      return;
    }
    if (models.length === 0) {
      alert("No Ollama models connected.");
      return;
    }
    usedVoiceRef.current = true;
    setInCall(true);
    setAnalysis(null);
    // Appended, not a reset - a call picks up in the same thread as any
    // typed messages already here, since both now share one chat view.
    const greeting = "Hello. I'm here to listen. Take your time. How are you feeling today?";
    setMessages(prev => [...prev, { role: "assistant", content: greeting }]);
    await speak(greeting);
    if (inCallRef.current) {
      startListening();
    }
  };

  const analyzeDistress = async () => {
    const turns = messagesRef.current.filter(m => m.role === "user");
    if (!turns.length) {
      setAnalysis({
        score: null,
        description: "There is not enough user conversation to analyze.",
        meta: ""
      });
      return;
    }
    
    setAnalysis({ score: 'Analyzing...', description: 'Reviewing the conversation for signs of distress...', meta: `Local analysis via ${model}` });
    
    try {
      // 1. Analyze the conversation using the standard ollamaClient logic
      const aiAnalysis = await analyzeConversation(messagesRef.current, model);
      
      // 2. Format responses for the backend
      const formattedResponses = messagesRef.current
        .filter(m => m.role === "user" || m.role === "assistant")
        .map(m => (m.role === "user" ? "Person: " : "Mansakha: ") + m.content);

      // 3. Submit to backend to update distress scores in the DB
      const result = await submitMutation.mutateAsync({
        channel: usedVoiceRef.current ? 'IVRS' : 'Chatbot',
        responses: formattedResponses,
        aiAnalysis
      });

      // 4. Update the UI with the final result
      let rawScore = Number(result?.scoreValue);
      let scoreVal = Number.isFinite(rawScore) ? Math.round(rawScore > 10 ? rawScore / 10 : rawScore) : 5;
      scoreVal = Math.max(0, Math.min(10, scoreVal));

      setAnalysis({
        score: scoreVal,
        description: result.summary || "Conversation analyzed and safely stored.",
        meta: `Post-conversation analysis • ${new Date().toLocaleTimeString()}`
      });
      setStatus(`● Distress analysis complete • ${model}`);
    } catch (e) {
      setAnalysis({
        score: 'Error',
        description: 'Failed to analyze or save the distress score.',
        meta: e.message
      });
      setStatus("✕ Distress analysis failed");
    }
  };

  const getScoreColor = (score) => {
    if (typeof score !== 'number') return colors.textPrimary;
    if (score >= 7) return colors.danger;
    if (score >= 4) return colors.warning;
    return colors.success;
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.topHeader}>
        {tier !== 'desktop' && (
          <Pressable onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={8}>
            <Feather name="arrow-left" size={20} color={colors.primaryDark} />
          </Pressable>
        )}
        <View style={styles.headerIconTile}>
          <Feather name="cpu" size={18} color={colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.statusTitle}>Local AI</Text>
          <Text style={styles.subtext}>{inCall ? voiceState : status}</Text>
        </View>
        <TopRightActions />
      </View>

      <View style={[styles.body, { maxWidth: formContentWidth[tier], width: '100%', alignSelf: 'center', paddingTop: spacing.md }]}>
        <FlatList
          ref={listRef}
          data={messages}
          showsVerticalScrollIndicator={false}
          keyExtractor={(_, i) => i.toString()}
          renderItem={({ item }) => <Bubble message={item} />}
          contentContainerStyle={styles.listContent}
        />
        {analysis && (
          <View style={styles.analysisPanel}>
            <View style={styles.analysisHeader}>
              <Text style={styles.analysisTitle}>Distress Analysis</Text>
              <Text style={[styles.score, { color: getScoreColor(analysis.score) }]}>
                {analysis.score !== null && analysis.score !== 'Error' && analysis.score !== 'Analyzing...' ? `${analysis.score} / 10` : analysis.score}
              </Text>
            </View>
            <Text style={styles.analysisDesc}>{analysis.description}</Text>
            <Text style={styles.analysisMeta}>{analysis.meta}</Text>
          </View>
        )}
        <View style={styles.inputContainer}>
          <View style={styles.inputPill}>
            <TextInput
              style={styles.textInput}
              placeholder="Type a message..."
              placeholderTextColor={colors.textSecondary}
              value={draft}
              onChangeText={setDraft}
              onKeyPress={(e) => {
                if (Platform.OS === 'web' && e.nativeEvent.key === 'Enter' && !e.nativeEvent.shiftKey) {
                  e.preventDefault();
                  handleSendText();
                }
              }}
              multiline
            />
            {/* Mic now starts/ends a live voice call with Mansakha (what the
                old separate "Voice Call" tab did) rather than dictating text
                into the composer - tap again (shown as a red phone-off
                button while a call is active) to hang up. Recognized speech
                and spoken replies land in the same bubble list above as any
                typed message. */}
            <Pressable
              style={[styles.micBtn, inCall && styles.micBtnActive]}
              onPress={toggleCall}
              accessibilityLabel={inCall ? 'End voice call with Mansakha' : 'Start voice call with Mansakha'}
            >
              <Feather name={inCall ? "phone-off" : "mic"} size={18} color={inCall ? colors.white : colors.primary} />
            </Pressable>
            <Pressable style={[styles.sendBtn, !draft.trim() && styles.sendBtnDisabled]} onPress={handleSendText} disabled={!draft.trim()}>
              <Feather name="send" size={18} color={colors.white} />
            </Pressable>
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
  backBtn: { padding: spacing.xs, marginRight: spacing.sm },
  headerIconTile: {
    width: 36, height: 36, borderRadius: radius.pill, backgroundColor: colors.surface,
    alignItems: 'center', justifyContent: 'center', marginRight: spacing.sm
  },
  statusTitle: { ...typography.h3, color: colors.primaryDark },
  subtext: { ...typography.caption, color: colors.textSecondary },
  body: { flex: 1, paddingHorizontal: spacing.lg },
  listContent: { paddingBottom: spacing.xl },
  emptyText: { textAlign: 'center', color: colors.textSecondary, marginTop: spacing.xxl },
  bubbleRow: { flexDirection: 'row', marginBottom: spacing.sm },
  bubbleRowUser: { justifyContent: 'flex-end' },
  bubble: { maxWidth: '80%', borderRadius: radius.lg, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  bubbleAi: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderTopLeftRadius: 4 },
  bubbleUser: { backgroundColor: colors.primary, borderTopRightRadius: 4 },
  bubbleRole: { fontSize: 10, fontWeight: 'bold', opacity: 0.65, marginBottom: 4, color: colors.textPrimary },
  bubbleText: { ...typography.body, color: colors.textPrimary },
  bubbleTextUser: { color: colors.white },
  inputContainer: {
    paddingVertical: spacing.md,
    backgroundColor: colors.background, 
  },
  inputPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 24,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  textInput: {
    flex: 1, ...typography.body, color: colors.textPrimary,
    maxHeight: 120, paddingHorizontal: 8,
    paddingTop: Platform.OS === 'web' ? 10 : 8,
    paddingBottom: Platform.OS === 'web' ? 10 : 8,
    outlineStyle: 'none',
  },
  micBtn: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surface,
    alignItems: 'center', justifyContent: 'center', marginLeft: 4,
    borderWidth: 1, borderColor: colors.border,
  },
  // Solid red "in a call, tap to hang up" state - same red-active convention
  // used for the counsellor chat's own voice-note recording button.
  micBtnActive: {
    borderColor: colors.danger, backgroundColor: colors.danger,
  },
  sendBtn: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center', marginLeft: 4,
  },
  sendBtnDisabled: { opacity: 0.5 },
  analyzeBtn: { width: '100%', padding: spacing.md, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  analyzeBtnText: { ...typography.body, color: colors.textPrimary, fontWeight: '600' },
  note: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.xl },
  analysisPanel: { marginTop: spacing.sm, backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, borderWidth: 1, borderColor: colors.border },
  analysisHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  analysisTitle: { ...typography.h3, fontWeight: 'bold', color: colors.textPrimary },
  score: { fontSize: 24, fontWeight: '800' },
  analysisDesc: { ...typography.body, color: colors.textSecondary, marginBottom: spacing.sm },
  analysisMeta: { ...typography.caption, color: colors.textSecondary },
});
