import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, TextInput, KeyboardAvoidingView, Platform, Linking } from 'react-native';
import { Feather } from '@expo/vector-icons';
import {
  useAudioRecorder,
  useAudioRecorderState,
  useAudioPlayer,
  useAudioPlayerStatus,
  RecordingPresets,
  setAudioModeAsync,
  requestRecordingPermissionsAsync,
  getRecordingPermissionsAsync,
} from 'expo-audio';
import { useToast } from '../../shared/context/ToastContext';
import { colors } from '../../shared/theme/colors';
import { spacing } from '../../shared/theme/spacing';
import { radius } from '../../shared/theme/radius';
import { typography } from '../../shared/theme/typography';
import { shadow } from '../../shared/theme/shadow';
import { formContentWidth } from '../../shared/theme/layout';
import { useResponsive } from '../../shared/hooks/useResponsive';
import TopRightActions from '../../shared/components/TopRightActions';
import { LoadingState } from '../../shared/components/QueryStates';
import {
  useAssignedCounsellor,
  useCounsellorMessages,
  useSendCounsellorMessage,
  useSendCounsellorVoiceMessage,
  useSendTypingPing,
} from '../../shared/services/hooks';

// Minimum gap between "user is typing" pings sent to the backend while
// composing - avoids firing one per keystroke.
const TYPING_PING_THROTTLE_MS = 1500;

// Formats a whole/fractional number of seconds as WhatsApp-style "m:ss".
function formatDuration(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds || 0));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

function formatTimestamp(sentAt) {
  if (!sentAt) return '';
  const d = new Date(sentAt);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

// Lightweight static "waveform" decoration - not a real render of the
// audio's amplitude, just a few bars of varying height for visual texture.
const WAVEFORM_BAR_HEIGHTS = [6, 12, 8, 16, 10, 14, 7, 11];

export default function CounsellorChatScreen({ navigation }) {
  const { tier } = useResponsive();
  const toast = useToast();
  const counsellorQuery = useAssignedCounsellor();
  const messagesQuery = useCounsellorMessages();
  const sendMessage = useSendCounsellorMessage();
  const sendTypingPing = useSendTypingPing();
  const sendVoiceMessage = useSendCounsellorVoiceMessage();
  const [draft, setDraft] = useState('');
  const [isSendingVoice, setIsSendingVoice] = useState(false);
  const [playingMessageId, setPlayingMessageId] = useState(null);
  const scrollRef = useRef(null);
  const lastTypingPingAtRef = useRef(0);

  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder, 200);
  const player = useAudioPlayer(null);
  const playerStatus = useAudioPlayerStatus(player);

  const counsellor = counsellorQuery.data?.counsellor;
  const messages = messagesQuery.data?.messages || [];
  const otherPartyTyping = !!messagesQuery.data?.otherPartyTyping;

  useEffect(() => {
    scrollRef.current?.scrollToEnd({ animated: true });
  }, [messages.length]);

  // Reset the play/pause icon back to "play" once a voice note finishes.
  useEffect(() => {
    if (playingMessageId && playerStatus.didJustFinish) {
      setPlayingMessageId(null);
    }
  }, [playerStatus.didJustFinish, playingMessageId]);

  const handleCall = () => {
    if (!counsellor?.phone) return;
    Linking.openURL(`tel:${counsellor.phone}`).catch(() => toast.error('Could not start a call on this device.'));
  };

  const handleSend = async () => {
    const text = draft.trim();
    if (!text) return;
    setDraft('');
    try {
      await sendMessage.mutateAsync(text);
    } catch (err) {
      toast.error(err.message || 'Could not send that message.');
    }
  };

  const handleDraftChange = (text) => {
    setDraft(text);
    const now = Date.now();
    if (now - lastTypingPingAtRef.current >= TYPING_PING_THROTTLE_MS) {
      lastTypingPingAtRef.current = now;
      sendTypingPing.mutate();
    }
  };

  // Web-only: Enter alone sends the message (and must not also insert a
  // newline); Shift+Enter inserts a newline normally. Native mobile has no
  // hardware Enter key semantics for this, so this is guarded to web only -
  // untouched on a real device build, where the multiline TextInput just
  // keeps its default newline-on-Enter behavior.
  const handleComposerKeyPress = (e) => {
    if (Platform.OS !== 'web') return;
    const nativeEvent = e.nativeEvent || {};
    const key = nativeEvent.key ?? e.key;
    const shiftKey = nativeEvent.shiftKey ?? e.shiftKey ?? false;
    if (key === 'Enter' && !shiftKey) {
      if (typeof e.preventDefault === 'function') e.preventDefault();
      if (typeof nativeEvent.preventDefault === 'function') nativeEvent.preventDefault();
      handleSend();
    }
  };

  const handleMicPress = async () => {
    if (recorderState.isRecording) {
      const durationSeconds = (recorderState.durationMillis || 0) / 1000;
      try {
        await recorder.stop();
      } catch (err) {
        toast.error(err.message || 'Could not stop recording.');
        return;
      }
      const uri = recorder.uri;
      if (!uri) {
        toast.error('Recording failed - no audio was captured.');
        return;
      }
      setIsSendingVoice(true);
      try {
        await sendVoiceMessage.mutateAsync({ uri, durationSeconds });
      } catch (err) {
        toast.error(err.message || 'Could not send that voice message.');
      } finally {
        setIsSendingVoice(false);
      }
      return;
    }

    try {
      let permission = await getRecordingPermissionsAsync();
      if (!permission.granted) {
        permission = await requestRecordingPermissionsAsync();
      }
      if (!permission.granted) {
        toast.error('Microphone permission is required to record a voice message.');
        return;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
    } catch (err) {
      toast.error(err.message || 'Could not start recording.');
    }
  };

  const handleToggleVoicePlayback = (m) => {
    if (!m.audioUrl) return;
    if (playingMessageId === m.messageId && playerStatus.playing) {
      player.pause();
      return;
    }
    player.replace({ uri: m.audioUrl });
    player.play();
    setPlayingMessageId(m.messageId);
  };

  const sendDisabled = !draft.trim() || sendMessage.isPending || recorderState.isRecording;

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.topHeader}>
        {tier !== 'desktop' && (
          <Pressable onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={8}>
            <Feather name="arrow-left" size={20} color={colors.primaryDark} />
          </Pressable>
        )}
        <View style={styles.headerIconTile}>
          <Feather name="user" size={18} color={colors.primary} />
        </View>
        <View style={styles.nameBlock}>
          <Text style={styles.statusTitle}>{counsellor?.fullName || 'My Counsellor'}</Text>
          <Text style={styles.subtext}>Private, opted-in support</Text>
        </View>
        <View style={{ flex: 1 }} />
        {/* Green outline circle - the universal "make a call" convention
            (vs. red for emergency/decline), which tells this apart from the
            header's red Get Help Now button on color semantics alone,
            stronger than the blue-vs-red the two used to rely on. */}
        {!!counsellor && (
          <Pressable onPress={handleCall} style={styles.callIconBtn} hitSlop={8} accessibilityLabel="Call counsellor">
            <Feather name="phone" size={18} color={colors.success} />
          </Pressable>
        )}
        <TopRightActions />
      </View>

      <View style={[styles.body, { maxWidth: formContentWidth[tier], width: '100%', alignSelf: 'center' }]}>
        {counsellorQuery.isLoading || messagesQuery.isLoading ? (
          <LoadingState />
        ) : !counsellorQuery.data?.assigned ? (
          <View style={styles.content}>
            <Text style={styles.heroText}>You do not currently have a counsellor assigned.</Text>
          </View>
        ) : (
          <>
            <ScrollView
              ref={scrollRef}
              style={styles.thread}
              contentContainerStyle={styles.threadContent}
              onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
              showsVerticalScrollIndicator={false}
            >
              {messages.length === 0 ? (
                <Text style={styles.emptyText}>No messages yet - say hello.</Text>
              ) : (
                messages.map((m) => {
                  const isUser = m.senderType === 'user';
                  const isVoice = m.messageType === 'voice';
                  const isThisPlaying = isVoice && playingMessageId === m.messageId && playerStatus.playing;
                  return (
                    <View key={m.messageId} style={[styles.bubbleRow, isUser ? styles.bubbleRowRight : styles.bubbleRowLeft]}>
                      <View style={[styles.bubbleColumn, isUser ? styles.bubbleColumnRight : styles.bubbleColumnLeft]}>
                        {isVoice ? (
                          <Pressable
                            onPress={() => handleToggleVoicePlayback(m)}
                            style={[styles.bubble, styles.voiceBubble, isUser ? styles.bubbleUser : styles.bubbleOfficial]}
                            accessibilityRole="button"
                            accessibilityLabel={isThisPlaying ? 'Pause voice message' : 'Play voice message'}
                          >
                            <View style={[styles.voicePlayBtn, isUser ? styles.voicePlayBtnUser : styles.voicePlayBtnOfficial]}>
                              <Feather name={isThisPlaying ? 'pause' : 'play'} size={14} color={isUser ? colors.primary : colors.white} />
                            </View>
                            <View style={styles.waveform}>
                              {WAVEFORM_BAR_HEIGHTS.map((h, idx) => (
                                <View
                                  key={idx}
                                  style={[styles.waveformBar, { height: h }, isUser ? styles.waveformBarUser : styles.waveformBarOfficial]}
                                />
                              ))}
                            </View>
                            <Text style={[styles.voiceDuration, isUser && styles.bubbleTextUser]}>
                              {formatDuration(m.durationSeconds)}
                            </Text>
                          </Pressable>
                        ) : (
                          <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleOfficial]}>
                            <Text style={[styles.bubbleText, isUser && styles.bubbleTextUser]}>{m.body}</Text>
                          </View>
                        )}
                        <Text style={styles.timestamp}>{formatTimestamp(m.sentAt)}</Text>
                      </View>
                    </View>
                  );
                })
              )}
            </ScrollView>

            {otherPartyTyping && (
              <View style={styles.typingRow}>
                <Text style={styles.typingText}>{counsellor?.fullName || 'Your counsellor'} is typing...</Text>
              </View>
            )}

            <View style={styles.composerContainer}>
              <View style={styles.inputPill}>
                {recorderState.isRecording ? (
                  <View style={styles.recordingIndicator}>
                    <View style={styles.recordingDot} />
                    <Text style={styles.recordingText}>Recording... {formatDuration((recorderState.durationMillis || 0) / 1000)}</Text>
                  </View>
                ) : (
                  <TextInput
                    style={styles.composerInput}
                    value={draft}
                    onChangeText={handleDraftChange}
                    onKeyPress={handleComposerKeyPress}
                    placeholder="Type a message..."
                    placeholderTextColor={colors.textSecondary}
                    multiline
                  />
                )}
                <Pressable
                  style={[styles.micBtn, recorderState.isRecording && styles.micBtnActive]}
                  onPress={handleMicPress}
                  disabled={isSendingVoice}
                  accessibilityRole="button"
                  accessibilityLabel={recorderState.isRecording ? 'Stop recording' : 'Record a voice message'}
                >
                  <Feather
                    name={isSendingVoice ? 'loader' : recorderState.isRecording ? 'square' : 'mic'}
                    size={18}
                    color={recorderState.isRecording ? colors.white : colors.primary}
                  />
                </Pressable>
                <Pressable
                  style={[styles.sendBtn, sendDisabled && styles.sendBtnDisabled]}
                  onPress={handleSend}
                  disabled={sendDisabled}
                  accessibilityRole="button"
                  accessibilityLabel="Send message"
                >
                  <Feather name="send" size={18} color={colors.white} />
                </Pressable>
              </View>
            </View>
          </>
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
  },
  backBtn: { marginRight: spacing.sm, padding: spacing.xs },
  headerIconTile: {
    width: 36, height: 36, borderRadius: radius.pill, backgroundColor: colors.surface,
    alignItems: 'center', justifyContent: 'center', marginRight: spacing.md,
  },
  nameBlock: { flexShrink: 1 },
  statusTitle: { ...typography.h3, color: colors.primaryDark },
  subtext: { ...typography.caption, color: colors.textSecondary },
  callIconBtn: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.success,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  body: { flex: 1, width: '100%' },
  content: { flex: 1, padding: spacing.xl },
  heroText: { ...typography.body, color: colors.textSecondary, textAlign: 'center', lineHeight: 24 },
  thread: { flex: 1 },
  threadContent: { padding: spacing.lg, gap: spacing.sm, flexGrow: 1 },
  emptyText: { ...typography.caption, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.xl },
  bubbleRow: { flexDirection: 'row' },
  bubbleRowLeft: { justifyContent: 'flex-start' },
  bubbleRowRight: { justifyContent: 'flex-end' },
  bubbleColumn: { maxWidth: '80%' },
  bubbleColumnLeft: { alignItems: 'flex-start' },
  bubbleColumnRight: { alignItems: 'flex-end' },
  bubble: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
  },
  // Same asymmetric "tail" corner as ChatScreen.js's AI-chat bubbles
  // (bubbleAi/bubbleUser there) - own messages tuck in the top-right
  // corner, the other party's tuck in the top-left - so the two chat
  // screens read as one consistent bubble style, not two different ones.
  bubbleOfficial: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderTopLeftRadius: 4 },
  bubbleUser: { backgroundColor: colors.primary, borderTopRightRadius: 4 },
  bubbleText: { ...typography.body, color: colors.textPrimary },
  bubbleTextUser: { color: colors.white },
  timestamp: { ...typography.caption, color: colors.textSecondary, marginTop: 2, fontSize: 11 },
  // Voice message bubble - a natural variant of the text bubble (same
  // shape/background rules), swapping the body text for a play/pause
  // control, a static "waveform" decoration, and the recorded duration.
  voiceBubble: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minWidth: 160 },
  voicePlayBtn: {
    width: 28, height: 28, borderRadius: radius.pill,
    alignItems: 'center', justifyContent: 'center',
  },
  voicePlayBtnOfficial: { backgroundColor: colors.primary },
  voicePlayBtnUser: { backgroundColor: colors.white },
  waveform: { flexDirection: 'row', alignItems: 'center', gap: 3, flex: 1 },
  waveformBar: { width: 3, borderRadius: 2 },
  waveformBarOfficial: { backgroundColor: colors.border },
  waveformBarUser: { backgroundColor: 'rgba(255,255,255,0.5)' },
  voiceDuration: { ...typography.caption, color: colors.textPrimary },
  typingRow: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
    backgroundColor: colors.surface,
  },
  typingText: { ...typography.caption, color: colors.textSecondary, fontStyle: 'italic' },
  composerContainer: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.background,
  },
  inputPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.card,
  },
  composerInput: {
    flex: 1,
    maxHeight: 100,
    paddingHorizontal: spacing.sm,
    paddingTop: Platform.OS === 'web' ? 10 : 8,
    paddingBottom: Platform.OS === 'web' ? 10 : 8,
    color: colors.textPrimary,
    ...typography.body,
  },
  recordingIndicator: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  recordingDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.danger },
  recordingText: { ...typography.body, color: colors.textPrimary },
  micBtn: {
    width: 36, height: 36, borderRadius: radius.pill, backgroundColor: colors.surface,
    alignItems: 'center', justifyContent: 'center', marginLeft: 4,
    borderWidth: 1, borderColor: colors.border,
  },
  micBtnActive: { backgroundColor: colors.danger, borderColor: colors.danger },
  sendBtn: {
    width: 36, height: 36, borderRadius: radius.pill, backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center', marginLeft: 4,
  },
  sendBtnDisabled: { opacity: 0.5 },
});
