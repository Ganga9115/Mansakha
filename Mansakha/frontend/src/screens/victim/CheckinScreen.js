import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, TextInput, Platform, ActivityIndicator, KeyboardAvoidingView, Animated } from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as Speech from 'expo-speech';
import { colors } from '../../theme/colors';
import { spacing } from '../../theme/spacing';
import { radius } from '../../theme/radius';
import { typography } from '../../theme/typography';
import { shadow } from '../../theme/shadow';
import { formContentWidth } from '../../theme/layout';
import { useResponsive } from '../../hooks/useResponsive';
import { useToast } from '../../context/ToastContext';
import { useCheckin, useVictimDashboard } from '../../services/hooks';
import { checkOllamaConnection, sendCompanionMessage, analyzeConversation, OPENING_GREETING } from '../../services/ollamaClient';
import SegmentedToggle from '../../components/SegmentedToggle';
import DesktopHeaderActions from '../../components/DesktopHeaderActions';
import TopRightActions from '../../components/TopRightActions';

// Voice input (speech-to-text) only exists in the browser's Web Speech API -
// there's no native STT library in this app yet, so Call mode's mic is
// web-only. Text-to-speech still works everywhere via expo-speech.
const VOICE_SUPPORTED =
  Platform.OS === 'web' && typeof window !== 'undefined' && !!(window.SpeechRecognition || window.webkitSpeechRecognition);

const CALL_STATE_LABEL = {
  idle: 'Ready to talk',
  listening: 'Listening...',
  thinking: 'Thinking...',
  speaking: 'Speaking...',
};

const CONNECTION_LABEL = {
  connecting: 'Connecting to local AI...',
  connected: 'Local AI connected',
  error: 'Cannot reach local AI - is Ollama running?',
};
const CONNECTION_COLOR = {
  connecting: colors.textSecondary,
  connected: colors.success,
  error: colors.danger,
};

function Bubble({ message }) {
  const isVictim = message.role === 'user';
  return (
    <View style={[bubbleStyles.row, isVictim && bubbleStyles.rowVictim]}>
      <View style={[bubbleStyles.bubble, isVictim ? bubbleStyles.bubbleVictim : bubbleStyles.bubbleAi]}>
        <Text style={[bubbleStyles.text, isVictim && bubbleStyles.textVictim]}>{message.content}</Text>
      </View>
    </View>
  );
}

export default function CheckinScreen({ navigation }) {
  const toast = useToast();
  const checkin = useCheckin();
  const dashboardQuery = useVictimDashboard();
  const { tier, isDesktop } = useResponsive();

  const [ollamaStatus, setOllamaStatus] = useState('connecting'); // connecting | connected | error
  const [mode, setMode] = useState('chat'); // chat | call
  const [conversation, setConversation] = useState([{ role: 'assistant', content: OPENING_GREETING }]);
  const [draft, setDraft] = useState('');
  const [thinking, setThinking] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [callState, setCallState] = useState('idle');
  const [inCall, setInCall] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState('');

  const scrollRef = useRef(null);
  const recognitionRef = useRef(null);
  const inCallRef = useRef(false);
  const speakingRef = useRef(false);
  const conversationRef = useRef(conversation);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    conversationRef.current = conversation;
  }, [conversation]);

  useEffect(() => {
    checkOllamaConnection().then(({ connected }) => setOllamaStatus(connected ? 'connected' : 'error'));
    return () => {
      inCallRef.current = false;
      try {
        recognitionRef.current?.stop();
      } catch (e) {}
      Speech.stop();
    };
  }, []);

  useEffect(() => {
    const active = callState === 'listening' || callState === 'speaking';
    if (!active) {
      pulseAnim.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.12, duration: 700, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 700, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [callState, pulseAnim]);

  const retryConnection = async () => {
    setOllamaStatus('connecting');
    const { connected } = await checkOllamaConnection();
    setOllamaStatus(connected ? 'connected' : 'error');
  };

  const handleSend = async () => {
    const text = draft.trim();
    if (!text || thinking) return;
    setDraft('');
    const updated = [...conversationRef.current, { role: 'user', content: text }];
    setConversation(updated);
    setThinking(true);
    try {
      const reply = await sendCompanionMessage(updated);
      setConversation((prev) => [...prev, { role: 'assistant', content: reply }]);
      setOllamaStatus('connected');
    } catch (err) {
      toast.error(`Local AI error: ${err.message}`);
      setOllamaStatus('error');
    } finally {
      setThinking(false);
    }
  };

  const speak = (text) =>
    new Promise((resolve) => {
      speakingRef.current = true;
      setCallState('speaking');
      Speech.speak(text, {
        language: 'en-IN',
        rate: 0.92,
        onDone: () => {
          speakingRef.current = false;
          resolve();
        },
        onStopped: () => {
          speakingRef.current = false;
          resolve();
        },
        onError: () => {
          speakingRef.current = false;
          resolve();
        },
      });
    });

  const startListening = useCallback(() => {
    if (!inCallRef.current || speakingRef.current) return;
    if (!recognitionRef.current) recognitionRef.current = makeRecognition();
    if (!recognitionRef.current) return;
    try {
      recognitionRef.current.start();
    } catch (e) {}
  }, []);

  function makeRecognition() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return null;
    const r = new SR();
    r.continuous = false;
    r.interimResults = true;
    r.lang = 'en-IN';
    r.onstart = () => {
      if (inCallRef.current) setCallState('listening');
    };
    r.onresult = (e) => {
      let finalText = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) finalText += e.results[i][0].transcript;
      }
      if (finalText.trim()) handleVoiceMessage(finalText.trim());
    };
    r.onerror = (e) => {
      if (inCallRef.current && e.error !== 'not-allowed') {
        setTimeout(startListening, 500);
      } else if (e.error === 'not-allowed') {
        toast.error('Allow microphone access to use Call mode.');
      }
    };
    r.onend = () => {
      if (inCallRef.current && !speakingRef.current) setTimeout(startListening, 300);
    };
    return r;
  }

  const stopListening = () => {
    try {
      recognitionRef.current?.stop();
    } catch (e) {}
  };

  const handleVoiceMessage = async (text) => {
    if (!inCallRef.current) return;
    stopListening();
    setLiveTranscript(`You: ${text}`);
    setCallState('thinking');
    const updated = [...conversationRef.current, { role: 'user', content: text }];
    setConversation(updated);
    try {
      const reply = await sendCompanionMessage(updated);
      setConversation((prev) => [...prev, { role: 'assistant', content: reply }]);
      setOllamaStatus('connected');
      setLiveTranscript(`You: ${text}\n\nMansakha: ${reply}`);
      await speak(reply);
      if (inCallRef.current) setTimeout(startListening, 250);
    } catch (err) {
      toast.error(`Local AI error: ${err.message}`);
      setOllamaStatus('error');
      setCallState('idle');
      if (inCallRef.current) setTimeout(startListening, 1000);
    }
  };

  const toggleCall = async () => {
    if (inCall) {
      inCallRef.current = false;
      setInCall(false);
      Speech.stop();
      stopListening();
      setCallState('idle');
      return;
    }

    let status = ollamaStatus;
    if (status !== 'connected') {
      const result = await checkOllamaConnection();
      status = result.connected ? 'connected' : 'error';
      setOllamaStatus(status);
    }
    if (status !== 'connected') {
      toast.error('Cannot reach the local AI. Make sure Ollama is running on this device.');
      return;
    }

    inCallRef.current = true;
    setInCall(true);
    setLiveTranscript('');
    if (conversationRef.current.length <= 1) {
      await speak(conversationRef.current[0]?.content || OPENING_GREETING);
    }
    if (inCallRef.current) startListening();
  };

  const handleSubmit = async () => {
    const hasUserMessage = conversation.some((m) => m.role === 'user');
    if (!hasUserMessage) {
      toast.error('Share at least one message before submitting your check-in.');
      return;
    }
    if (inCall) await toggleCall();

    setSubmitting(true);
    try {
      const analysis = await analyzeConversation(conversation);
      const transcriptLines = conversation.map((m) => `${m.role === 'user' ? 'Victim' : 'Mansakha'}: ${m.content}`);
      const result = await checkin.mutateAsync({ channel: 'Chatbot', responses: transcriptLines, aiAnalysis: analysis });
      navigation.navigate('CheckinConfirmation', {
        riskLevel: result.riskLevel,
        summary: result.summary,
        alertTriggered: result.alertTriggered,
      });
    } catch (err) {
      toast.error(err.message || 'Could not submit your check-in.');
    } finally {
      setSubmitting(false);
    }
  };

  const canSubmit = !submitting && conversation.some((m) => m.role === 'user');

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.topHeader, isDesktop && styles.topHeaderDesktop]}>
        <View style={styles.headerLeft}>
          {isDesktop ? (
            <Feather name="heart" size={20} color={colors.primaryDark} style={styles.headerIconDesktop} />
          ) : (
            <View style={styles.avatarContainer}>
              <Feather name="heart" size={28} color={colors.primary} />
              <View style={styles.avatarEditBadge}>
                <Feather name="shield" size={10} color={colors.white} />
              </View>
            </View>
          )}
          <View style={styles.headerInfo}>
            {!isDesktop && (
              <View style={styles.pillBadge}>
                <Text style={styles.pillText}>DAILY CHECK-IN</Text>
              </View>
            )}
            <Text style={styles.statusTitle}>Mansakha Care</Text>
            {!isDesktop && <Text style={styles.subtext}>Talk it through, in chat or by voice</Text>}
          </View>
        </View>
        <View style={styles.headerRightRow}>
          {isDesktop ? (
            <DesktopHeaderActions
              fullName={dashboardQuery.data?.fullName}
              alertCount={dashboardQuery.data?.alerts?.length || 0}
              onBellPress={() => {}}
            />
          ) : (
            <TopRightActions />
          )}
        </View>
      </View>

      <View
        style={[
          styles.contentBody,
          isDesktop && styles.contentBodyDesktop,
          { maxWidth: formContentWidth[tier], width: '100%', alignSelf: 'center' },
        ]}
      >
        <Pressable
          style={styles.connectionPill}
          onPress={ollamaStatus === 'error' ? retryConnection : undefined}
        >
          <View style={[styles.connectionDot, { backgroundColor: CONNECTION_COLOR[ollamaStatus] }]} />
          <Text style={[styles.connectionText, { color: CONNECTION_COLOR[ollamaStatus] }]}>
            {CONNECTION_LABEL[ollamaStatus]}
          </Text>
          {ollamaStatus === 'error' && <Text style={styles.connectionRetry}>Tap to retry</Text>}
        </Pressable>

        <SegmentedToggle
          options={[
            { value: 'chat', label: 'Chat', icon: 'message-circle' },
            { value: 'call', label: 'Call', icon: 'phone' },
          ]}
          value={mode}
          onChange={setMode}
        />

        {mode === 'chat' ? (
          <View style={styles.chatArea}>
            <ScrollView
              ref={scrollRef}
              style={styles.chatScroll}
              contentContainerStyle={styles.chatContent}
              onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
            >
              {conversation.map((m, i) => (
                <Bubble key={i} message={m} />
              ))}
              {thinking && (
                <View style={bubbleStyles.row}>
                  <View style={[bubbleStyles.bubble, bubbleStyles.bubbleAi]}>
                    <Text style={[bubbleStyles.text, { color: colors.textSecondary }]}>Mansakha is typing...</Text>
                  </View>
                </View>
              )}
            </ScrollView>
            <View style={styles.composerRow}>
              <TextInput
                style={styles.textInput}
                placeholder="Type how you're feeling..."
                placeholderTextColor={colors.textSecondary}
                value={draft}
                onChangeText={setDraft}
                onSubmitEditing={handleSend}
                multiline
              />
              <Pressable style={styles.sendBtn} onPress={handleSend} disabled={thinking || !draft.trim()}>
                <Feather name="send" size={18} color={colors.white} />
              </Pressable>
            </View>
          </View>
        ) : (
          <View style={styles.callCard}>
            <View style={styles.callArea}>
              <Animated.View
                style={[
                  styles.avatarCircle,
                  (callState === 'listening' || callState === 'speaking') && styles.avatarCircleActive,
                  { transform: [{ scale: pulseAnim }] },
                ]}
              >
                <Feather
                  name={callState === 'speaking' ? 'volume-2' : 'mic'}
                  size={40}
                  color={callState === 'idle' ? colors.textSecondary : colors.primary}
                />
              </Animated.View>
              <Text style={styles.callStateText}>{inCall ? CALL_STATE_LABEL[callState] : 'Ready to talk'}</Text>
              <Text style={styles.transcriptText}>
                {liveTranscript || 'Press the call button and Mansakha will speak first.'}
              </Text>

              {VOICE_SUPPORTED ? (
                <Pressable style={[styles.callBtn, inCall && styles.callBtnActive]} onPress={toggleCall}>
                  <Feather name={inCall ? 'phone-off' : 'phone'} size={26} color={colors.white} />
                </Pressable>
              ) : (
                <View style={styles.unsupportedBox}>
                  <Feather name="alert-circle" size={16} color={colors.textSecondary} style={{ marginRight: spacing.xs }} />
                  <Text style={styles.unsupportedNote}>
                    Voice call needs microphone support in a web browser. Open Mansakha on the web to use Call mode,
                    or use Chat instead.
                  </Text>
                </View>
              )}
            </View>
          </View>
        )}

        <Pressable style={[styles.submitBtn, !canSubmit && styles.submitBtnDisabled]} onPress={handleSubmit} disabled={!canSubmit}>
          {submitting ? (
            <ActivityIndicator color={colors.white} style={{ marginRight: spacing.xs }} />
          ) : (
            <Feather name="check-circle" size={18} color={colors.white} style={{ marginRight: spacing.xs }} />
          )}
          <Text style={styles.submitBtnText}>{submitting ? 'Analyzing your check-in...' : "I'm done - submit check-in"}</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  topHeader: {
    backgroundColor: colors.primaryLight,
    paddingTop: spacing.xxxl,
    paddingBottom: spacing.xl,
    paddingHorizontal: spacing.xl,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  topHeaderDesktop: { height: 64, paddingTop: 0, paddingBottom: 0, alignItems: 'center' },
  headerIconDesktop: { marginRight: spacing.sm },
  headerLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  avatarContainer: {
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
    position: 'relative',
  },
  avatarEditBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: colors.primaryDark,
    borderRadius: radius.pill,
    padding: 3,
  },
  headerInfo: { flex: 1 },
  pillBadge: {
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
    alignSelf: 'flex-start',
    marginBottom: 4,
  },
  pillText: { ...typography.caption, color: colors.primary, fontWeight: '700' },
  statusTitle: { ...typography.h3, color: colors.primaryDark },
  subtext: { ...typography.caption, color: colors.textSecondary },
  headerRightRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  contentBody: {
    flex: 1,
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    marginTop: -spacing.xl,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.lg,
  },
  contentBodyDesktop: { marginTop: 0, borderTopLeftRadius: 0, borderTopRightRadius: 0 },
  connectionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    marginBottom: spacing.md,
  },
  connectionDot: { width: 8, height: 8, borderRadius: radius.pill, marginRight: spacing.xs },
  connectionText: { ...typography.caption, fontWeight: '700' },
  connectionRetry: { ...typography.caption, color: colors.textSecondary, marginLeft: spacing.sm, textDecorationLine: 'underline' },
  chatArea: { flex: 1, minHeight: 320 },
  chatScroll: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.xl,
    backgroundColor: colors.surface,
  },
  chatContent: { padding: spacing.lg },
  composerRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  textInput: {
    flex: 1,
    ...typography.body,
    color: colors.textPrimary,
    maxHeight: 100,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: colors.primaryDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  callCard: {
    flex: 1,
    borderRadius: radius.xl,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.card,
  },
  callArea: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.xl },
  avatarCircle: {
    width: 120,
    height: 120,
    borderRadius: radius.pill,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  avatarCircleActive: { backgroundColor: colors.infoLight, borderWidth: 2, borderColor: colors.primary },
  callStateText: { ...typography.h2, color: colors.primaryDark, marginBottom: spacing.sm },
  transcriptText: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.xl,
    minHeight: 60,
  },
  callBtn: {
    width: 72,
    height: 72,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.pop,
  },
  callBtnActive: { backgroundColor: colors.danger },
  unsupportedBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    maxWidth: 320,
    backgroundColor: colors.warningLight,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  unsupportedNote: { ...typography.caption, color: colors.textSecondary, flex: 1, lineHeight: 16 },
  submitBtn: {
    backgroundColor: colors.primaryDark,
    borderRadius: radius.xl,
    paddingVertical: spacing.md,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: spacing.md,
    ...shadow.card,
  },
  submitBtnDisabled: { opacity: 0.5 },
  submitBtnText: { ...typography.bodyStrong, color: colors.white, fontSize: 16 },
});

const bubbleStyles = StyleSheet.create({
  row: { flexDirection: 'row', marginBottom: spacing.sm },
  rowVictim: { justifyContent: 'flex-end' },
  bubble: { maxWidth: '80%', borderRadius: radius.lg, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  bubbleAi: { backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, borderTopLeftRadius: 4 },
  bubbleVictim: { backgroundColor: colors.primary, borderTopRightRadius: 4 },
  text: { ...typography.body, color: colors.textPrimary },
  textVictim: { color: colors.white },
});
