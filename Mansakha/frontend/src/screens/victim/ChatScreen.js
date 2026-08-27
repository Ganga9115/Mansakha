import React, { useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, FlatList, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import { spacing } from '../../theme/spacing';
import { radius } from '../../theme/radius';
import { typography } from '../../theme/typography';
import { formContentWidth } from '../../theme/layout';
import { useResponsive } from '../../hooks/useResponsive';
import TopRightActions from '../../components/TopRightActions';
import { QueryBoundary } from '../../components/QueryStates';
import { useChatHistory, useSendChatMessage } from '../../services/hooks';

function Bubble({ message }) {
  const isVictim = message.sender === 'victim';
  return (
    <View style={[styles.bubbleRow, isVictim && styles.bubbleRowVictim]}>
      <View style={[styles.bubble, isVictim ? styles.bubbleVictim : styles.bubbleAi]}>
        <Text style={[styles.bubbleText, isVictim && styles.bubbleTextVictim]}>{message.body}</Text>
      </View>
    </View>
  );
}

export default function ChatScreen({ navigation }) {
  const { tier } = useResponsive();
  const historyQuery = useChatHistory();
  const sendMessage = useSendChatMessage();
  const [draft, setDraft] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const listRef = useRef(null);
  const recognitionRef = useRef(null);

  const toggleVoice = () => {
    if (Platform.OS !== 'web') {
      alert("Voice input requires a web browser in this prototype.");
      return;
    }
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Your browser does not support voice input.");
      return;
    }

    if (isRecording) {
      recognitionRef.current?.stop();
      setIsRecording(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onstart = () => setIsRecording(true);
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map(res => res[0].transcript)
        .join('');
      setDraft(transcript);
    };
    recognition.onerror = () => setIsRecording(false);
    recognition.onend = () => setIsRecording(false);

    recognitionRef.current = recognition;
    recognition.start();
  };

  const handleSend = async () => {
    const text = draft.trim();
    if (!text) return;
    setDraft('');
    try {
      await sendMessage.mutateAsync(text);
      requestAnimationFrame(() => listRef.current?.scrollToEnd?.({ animated: true }));
    } catch (err) {
      // Send failures surface via sendMessage.isError below - draft stays cleared
      // to match the send-then-settle pattern rather than restoring stale text.
    }
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
          <Feather name="message-circle" size={18} color={colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.statusTitle}>Talk to Mansakha</Text>
          <Text style={styles.subtext}>Safe, private AI conversation</Text>
        </View>
        <TopRightActions />
      </View>

      <View style={[styles.body, { maxWidth: formContentWidth[tier], width: '100%', alignSelf: 'center' }]}>
        <QueryBoundary query={historyQuery} empty={(d) => !d?.messages?.length}>
          {(data) => (
            <FlatList
              ref={listRef}
              data={data.messages}
              keyExtractor={(m) => String(m.messageId)}
              renderItem={({ item }) => <Bubble message={item} />}
              contentContainerStyle={styles.listContent}
              onContentSizeChange={() => listRef.current?.scrollToEnd?.({ animated: false })}
              showsVerticalScrollIndicator={false}
            />
          )}
        </QueryBoundary>
      </View>

      <View style={[styles.inputContainer, { maxWidth: formContentWidth[tier], width: '100%', alignSelf: 'center' }]}>
        <View style={styles.inputPill}>
          <Pressable 
            style={[styles.micBtn, isRecording && { backgroundColor: colors.danger }]} 
            onPress={toggleVoice} 
            accessibilityLabel="Voice input"
          >
            <Feather name="mic" size={18} color={isRecording ? colors.white : colors.textSecondary} />
          </Pressable>
          
          <TextInput
            style={styles.textInput}
            placeholder="Type your message..."
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
          
          <Pressable style={[styles.sendBtn, (!draft.trim() || sendMessage.isPending) && styles.sendBtnDisabled]} onPress={handleSend} disabled={sendMessage.isPending || !draft.trim()}>
            <Feather name="send" size={18} color={colors.white} />
          </Pressable>
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
  },
  backBtn: { marginRight: spacing.sm, padding: spacing.xs },
  headerIconTile: {
    width: 36, height: 36, borderRadius: radius.pill, backgroundColor: colors.surface,
    alignItems: 'center', justifyContent: 'center', marginRight: spacing.md,
  },
  statusTitle: { ...typography.h3, color: colors.primaryDark },
  subtext: { ...typography.caption, color: colors.textSecondary },
  body: { flex: 1 },
  listContent: { padding: spacing.lg, paddingBottom: spacing.xl },
  bubbleRow: { flexDirection: 'row', marginBottom: spacing.sm },
  bubbleRowVictim: { justifyContent: 'flex-end' },
  bubble: { maxWidth: '80%', borderRadius: radius.lg, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  bubbleAi: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderTopLeftRadius: 4 },
  bubbleVictim: { backgroundColor: colors.primary, borderTopRightRadius: 4 },
  bubbleText: { ...typography.body, color: colors.textPrimary },
  bubbleTextVictim: { color: colors.white },
  inputContainer: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.background, // Blends with the body
  },
  inputPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 24,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  micBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: 'transparent',
    alignItems: 'center', justifyContent: 'center',
  },
  textInput: {
    flex: 1, ...typography.body, color: colors.textPrimary,
    maxHeight: 120,
    paddingHorizontal: 8,
    paddingTop: Platform.OS === 'web' ? 10 : 8,
    paddingBottom: Platform.OS === 'web' ? 10 : 8,
    outlineStyle: 'none',
  },
  sendBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primaryDark,
    alignItems: 'center', justifyContent: 'center',
    marginLeft: 4,
  },
  sendBtnDisabled: {
    backgroundColor: colors.borderStrong,
    opacity: 0.6,
  }
});
