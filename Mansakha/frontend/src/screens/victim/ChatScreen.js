import React, { useRef, useState, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, FlatList, TextInput, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import { spacing } from '../../theme/spacing';
import { radius } from '../../theme/radius';
import { typography } from '../../theme/typography';
import { formContentWidth } from '../../theme/layout';
import { useResponsive } from '../../hooks/useResponsive';
import TopRightActions from '../../components/TopRightActions';
import SegmentedToggle from '../../components/SegmentedToggle';

const OLLAMA = "http://127.0.0.1:11434";
const CHAT = OLLAMA + "/api/chat";
const TAGS = OLLAMA + "/api/tags";
const SYSTEM = `You are Mansakha, a calm and supportive conversational companion. Listen with empathy. Keep replies short and natural. Ask one gentle question at a time. Do not diagnose mental-health conditions. Do not assign risk levels or distress scores. Do not claim to be a doctor, counsellor, lawyer or police officer. Do not claim you contacted anyone. A separate post-conversation distress analysis handles distress scoring. If immediate danger is described, do not ask same question again and again, encourage immediate local emergency help.`;

function Bubble({ message }) {
  const isVictim = message.role === 'user';
  return (
    <View style={[styles.bubbleRow, isVictim && styles.bubbleRowVictim]}>
      <View style={[styles.bubble, isVictim ? styles.bubbleVictim : styles.bubbleAi]}>
        <Text style={[styles.bubbleRole, isVictim && { color: 'rgba(255,255,255,0.8)' }]}>{isVictim ? 'YOU' : 'MANSAKHA'}</Text>
        <Text style={[styles.bubbleText, isVictim && styles.bubbleTextVictim]}>{message.content}</Text>
      </View>
    </View>
  );
}

export default function ChatScreen({ navigation }) {
  const { tier } = useResponsive();
  const [mode, setMode] = useState('text'); // 'text' | 'voice'
  const [model, setModel] = useState('gemma3:4b');
  const [models, setModels] = useState([]);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [status, setStatus] = useState('Connecting to Ollama...');
  
  // Voice Call State
  const [inCall, setInCall] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [voiceState, setVoiceState] = useState('Ready to talk');
  const [transcript, setTranscript] = useState('Press the call button and Mansakha will speak first.');
  const recognitionRef = useRef(null);

  // Dictation State (for Text Chat)
  const [isDictating, setIsDictating] = useState(false);
  const dictationRef = useRef(null);
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

  const toggleDictation = () => {
    if (isDictating) {
      try { dictationRef.current?.stop(); } catch (e) {}
      setIsDictating(false);
      return;
    }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      alert("Speech recognition unavailable in this browser.");
      return;
    }
    const r = new SR();
    r.continuous = false;
    r.interimResults = true;
    r.lang = "en-IN";
    r.onstart = () => setIsDictating(true);
    r.onresult = (e) => {
      let finalStr = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) finalStr += e.results[i][0].transcript;
      }
      if (finalStr.trim()) {
        setDraft(prev => (prev ? prev + " " + finalStr.trim() : finalStr.trim()));
      }
    };
    r.onerror = () => setIsDictating(false);
    r.onend = () => setIsDictating(false);
    
    dictationRef.current = r;
    r.start();
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
    r.onresult = e => {
      let f = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) f += e.results[i][0].transcript;
      }
      setTranscript(f);
      if (f.trim()) {
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
      if (inCallRef.current && !speakingRef.current) {
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
    if (!inCallRef.current || speakingRef.current) return;
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
    setTranscript("You: " + text);
    setStatus("Mansakha is thinking...");
    try {
      const reply = await askOllama(text, messagesRef.current);
      setTranscript(`You: ${text}\n\nMansakha: ${reply}`);
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
    setInCall(true);
    setMessages([]);
    setAnalysis(null);
    const greeting = "Hello. I'm here to listen. Take your time. How are you feeling today?";
    setMessages([{ role: "assistant", content: greeting }]);
    setTranscript("Mansakha: " + greeting);
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
    
    const transcriptText = messagesRef.current
      .filter(m => m.role === "user" || m.role === "assistant")
      .map(m => (m.role === "user" ? "USER: " : "MANSAKHA: ") + m.content)
      .join("\\n");
      
    const prompt = `Analyze ONLY the user's messages in the conversation below for apparent emotional distress.

Return ONLY valid JSON with exactly these fields:
{
  "score": number,
  "description": "string"
}

Rules:
- score must be a whole number from 0 to 10.
- 0 means no clear distress in the conversation.
- 10 means very strong signs of distress.
- Base the score on the actual conversation, not assumptions.
- The description must briefly explain the main evidence from what the user said.
- Mention concrete themes or statements from the conversation, but do not invent facts.
- Do not diagnose a mental illness.
- Do not call the score a medical diagnosis.
- Do not recommend treatment.
- This is an experimental conversational distress indicator, not a clinical assessment.

CONVERSATION:
${transcriptText}`;

    try {
      const r = await fetch(CHAT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: model,
          stream: false,
          messages: [{ role: "system", content: "You are a careful post-conversation distress analysis module. Output only the requested JSON." }, { role: "user", content: prompt }],
          options: { temperature: 0.1 }
        })
      });
      if (!r.ok) throw new Error(await r.text());
      const d = await r.json();
      let raw = d?.message?.content?.trim() || "";
      raw = raw.replace(/^```json\s*/i, "").replace(/^```\s*/, "").replace(/\s*```$/, "").trim();
      const result = JSON.parse(raw);
      let scoreVal = Math.round(Number(result.score));
      if (!Number.isFinite(scoreVal)) throw new Error("Invalid score");
      scoreVal = Math.max(0, Math.min(10, scoreVal));
      
      setAnalysis({
        score: scoreVal,
        description: result.description || "No description returned.",
        meta: `Post-conversation analysis • ${new Date().toLocaleTimeString()}`
      });
      setStatus(`● Distress analysis complete • ${model}`);
    } catch (e) {
      setAnalysis({
        score: 'Error',
        description: 'The local model returned an invalid analysis.',
        meta: e.message
      });
      setStatus("✕ Distress analysis failed");
    }
  };

  const handleClear = () => {
    if (inCall) toggleCall();
    setMessages([]);
    setTranscript('Ready to talk');
    setVoiceState('Ready to talk');
    setAnalysis(null);
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
          <Text style={styles.subtext}>{status}</Text>
        </View>
        <Pressable onPress={handleClear} style={styles.clearBtn}><Text style={styles.clearBtnText}>Clear</Text></Pressable>
        <Pressable onPress={loadModels} style={[styles.clearBtn, { marginLeft: spacing.xs }]}><Text style={styles.clearBtnText}>Refresh</Text></Pressable>
        <TopRightActions />
      </View>

      <View style={[styles.body, { maxWidth: formContentWidth[tier], width: '100%', alignSelf: 'center', paddingTop: spacing.md }]}>
        <SegmentedToggle
          options={[
            { value: 'text', label: 'Text Chat', icon: 'message-square' },
            { value: 'voice', label: 'Voice Call', icon: 'phone' }
          ]}
          value={mode}
          onChange={(v) => {
            if (inCall) toggleCall();
            setMode(v);
          }}
        />

        {mode === 'text' && (
          <>
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
                <Pressable
                  style={[styles.micBtn, isDictating && styles.micBtnActive]}
                  onPress={toggleDictation}
                >
                  <Feather name={isDictating ? "mic-off" : "mic"} size={20} color={isDictating ? colors.danger : colors.primary} />
                </Pressable>
                <Pressable style={[styles.sendBtn, !draft.trim() && styles.sendBtnDisabled]} onPress={handleSendText} disabled={!draft.trim()}>
                  <Feather name="send" size={18} color={colors.white} />
                </Pressable>
              </View>
            </View>
          </>
        )}

        {mode === 'voice' && (
          <ScrollView contentContainerStyle={styles.voiceCenter} showsVerticalScrollIndicator={false}>
            <View style={[styles.avatar, speaking && styles.avatarActive]}>
              <Text style={styles.avatarEmoji}>🎧</Text>
            </View>
            <Text style={styles.voiceState}>{voiceState}</Text>
            <Text style={styles.transcript}>{transcript}</Text>
            
            <Pressable style={[styles.callBtn, inCall && styles.callBtnDanger]} onPress={toggleCall}>
              <Feather name={inCall ? "phone-off" : "phone"} size={28} color={colors.white} />
            </Pressable>
            
            {!inCall && messages.length > 0 && !analysis && (
              <Pressable style={styles.analyzeBtn} onPress={analyzeDistress}>
                <Text style={styles.analyzeBtnText}>Analyze Distress</Text>
              </Pressable>
            )}

            {analysis && (
              <View style={[styles.analysisPanel, { marginTop: spacing.xl, width: '100%' }]}>
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
          </ScrollView>
        )}
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
  clearBtn: { padding: spacing.sm, backgroundColor: colors.surface, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border },
  clearBtnText: { ...typography.bodySmall, color: colors.textPrimary },
  body: { flex: 1, paddingHorizontal: spacing.lg },
  listContent: { paddingBottom: spacing.xl },
  emptyText: { textAlign: 'center', color: colors.textSecondary, marginTop: spacing.xxl },
  bubbleRow: { flexDirection: 'row', marginBottom: spacing.sm },
  bubbleRowVictim: { justifyContent: 'flex-end' },
  bubble: { maxWidth: '80%', borderRadius: radius.lg, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  bubbleAi: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderTopLeftRadius: 4 },
  bubbleVictim: { backgroundColor: colors.primary, borderTopRightRadius: 4 },
  bubbleRole: { fontSize: 10, fontWeight: 'bold', opacity: 0.65, marginBottom: 4, color: colors.textPrimary },
  bubbleText: { ...typography.body, color: colors.textPrimary },
  bubbleTextVictim: { color: colors.white },
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
  micBtnActive: {
    borderColor: colors.danger, backgroundColor: colors.danger + '1A', // transparent light red
  },
  sendBtn: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center', marginLeft: 4,
  },
  sendBtnDisabled: { opacity: 0.5 },
  voiceCenter: { alignItems: 'center', padding: spacing.xl, paddingBottom: 100 },
  avatar: { width: 130, height: 130, borderRadius: 65, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', marginVertical: spacing.xl },
  avatarActive: { backgroundColor: colors.primaryLight, shadowColor: colors.primary, shadowOpacity: 0.5, shadowRadius: 20, shadowOffset: { width: 0, height: 0 }, elevation: 10 },
  avatarEmoji: { fontSize: 52 },
  voiceState: { ...typography.h2, fontWeight: '600', marginBottom: spacing.md, color: colors.textPrimary },
  transcript: { minHeight: 100, textAlign: 'center', color: colors.textSecondary, marginBottom: spacing.xl, ...typography.body },
  callBtn: { width: 76, height: 76, borderRadius: 38, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.xl },
  callBtnDanger: { backgroundColor: colors.danger },
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
