import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, TextInput, KeyboardAvoidingView, Platform, Linking, Modal } from 'react-native';
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
import { LoadingState, ErrorState } from '../../shared/components/QueryStates';
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

// Frequently used emojis for quick selection
const QUICK_EMOJIS = [
  '😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣', '😊', '😇',
  '🙂', '🙃', '😉', '😌', '😍', '🥰', '😘', '😗', '😙', '😚',
  '😋', '😛', '😝', '😜', '🤪', '🤨', '🧐', '🤓', '😎', '🤩',
  '🥳', '😏', '😒', '😞', '😔', '😟', '😕', '🙁', '☹️', '😣',
  '😖', '😫', '😩', '🥺', '😢', '😭', '😤', '😠', '😡', '🤬',
  '🤯', '😳', '🥵', '🥶', '😱', '😨', '😰', '😥', '😓', '🤗',
  '🤔', '🤭', '🤫', '🤥', '😶', '😐', '😑', '😬', '🙄', '😯',
  '👍', '👎', '👏', '🙌', '🙏', '❤️', '💖', '✨', '🔥', '🎉'
];

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
  const [isPaused, setIsPaused] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
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
    if (recorderState.isRecording || isPaused) {
      handleFinishVoiceRecording();
      return;
    }

    const text = draft.trim();
    if (!text) return;
    setDraft('');
    setShowEmojiPicker(false);
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

  const handleSelectEmoji = (emoji) => {
    handleDraftChange(draft + emoji);
  };

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

  const handleStartVoiceRecording = async () => {
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
      setIsPaused(false);
    } catch (err) {
      toast.error(err.message || 'Could not start recording.');
    }
  };

  const handleTogglePauseRecording = () => {
    if (isPaused) {
      recorder.record();
      setIsPaused(false);
    } else {
      recorder.pause();
      setIsPaused(true);
    }
  };

  const handleDeleteRecording = async () => {
    try {
      await recorder.stop();
    } catch (err) {
      // Ignore cleanup error on cancel
    } finally {
      setIsPaused(false);
    }
  };

  const handleFinishVoiceRecording = async () => {
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
      setIsPaused(false);
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

  const isRecordingActive = recorderState.isRecording || isPaused;
  const sendDisabled = (!draft.trim() && !isRecordingActive) || sendMessage.isPending || isSendingVoice;

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
        {/* Single Green Call Button for Counsellor */}
        {!!counsellor && (
          <Pressable onPress={handleCall} style={styles.callIconBtn} hitSlop={8} accessibilityLabel="Call counsellor">
            <Feather name="phone" size={18} color={colors.success} />
          </Pressable>
        )}
      </View>

      <View style={[styles.body, { maxWidth: formContentWidth[tier], width: '100%', alignSelf: 'center' }]}>
        {counsellorQuery.isLoading || messagesQuery.isLoading ? (
          <LoadingState />
        ) : counsellorQuery.isError || messagesQuery.isError ? (
          <ErrorState
            message="Couldn't load your counsellor chat. Check your connection and try again."
            onRetry={() => { counsellorQuery.refetch(); messagesQuery.refetch(); }}
          />
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
              <View style={styles.dateBadgeContainer}>
                <View style={styles.dateBadge}>
                  <Text style={styles.dateBadgeText}>Today</Text>
                </View>
              </View>

              {messages.length === 0 ? (
                <Text style={styles.emptyText}>No messages yet - say hello.</Text>
              ) : (
                messages.map((m) => {
                  const isUser = m.senderType === 'user';
                  const isVoice = m.messageType === 'voice';
                  const isThisPlaying = isVoice && playingMessageId === m.messageId && playerStatus.playing;
                  return (
                    <View key={m.messageId} style={[styles.bubbleRow, isUser ? styles.bubbleRowRight : styles.bubbleRowLeft]}>
                      {!isUser && (
                        <View style={styles.avatarTile}>
                          <Feather name="user" size={16} color={colors.primary} />
                        </View>
                      )}
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
                        <View style={styles.metaRow}>
                          <Text style={styles.timestamp}>{formatTimestamp(m.sentAt)}</Text>
                          {isUser && <Feather name="check-circle" size={10} color={colors.primary} style={styles.readIcon} />}
                        </View>
                      </View>
                      {isUser && (
                        <View style={[styles.avatarTile, styles.userAvatarTile]}>
                          <Feather name="user" size={16} color={colors.white} />
                        </View>
                      )}
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

            {/* Emoji Selection Grid Popup */}
            {showEmojiPicker && (
              <View style={styles.emojiPickerContainer}>
                <View style={styles.emojiHeader}>
                  <Text style={styles.emojiHeaderText}>Select Emoji</Text>
                  <Pressable onPress={() => setShowEmojiPicker(false)} hitSlop={8}>
                    <Feather name="x" size={18} color={colors.textSecondary} />
                  </Pressable>
                </View>
                <ScrollView contentContainerStyle={styles.emojiGrid} keyboardShouldPersistTaps="handled">
                  {QUICK_EMOJIS.map((emoji, index) => (
                    <Pressable
                      key={index}
                      style={styles.emojiItem}
                      onPress={() => handleSelectEmoji(emoji)}
                    >
                      <Text style={styles.emojiText}>{emoji}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            )}

            <View style={styles.composerContainer}>
              <View style={styles.inputContainer}>
                {isRecordingActive ? (
                  <View style={styles.recordingIndicator}>
                    <Pressable
                      onPress={handleDeleteRecording}
                      style={styles.actionIconButton}
                      accessibilityRole="button"
                      accessibilityLabel="Delete recording"
                    >
                      <Feather name="trash-2" size={20} color={colors.danger} />
                    </Pressable>
                    <Pressable
                      onPress={handleTogglePauseRecording}
                      style={styles.actionIconButton}
                      accessibilityRole="button"
                      accessibilityLabel={isPaused ? 'Resume recording' : 'Pause recording'}
                    >
                      <Feather name={isPaused ? 'play' : 'pause'} size={20} color={colors.primary} />
                    </Pressable>
                    <View style={styles.recordingDot} />
                    <Text style={styles.recordingText}>
                      {isPaused ? 'Paused' : 'Recording...'} {formatDuration((recorderState.durationMillis || 0) / 1000)}
                    </Text>
                  </View>
                ) : (
                  <>
                    <TextInput
                      style={styles.composerInput}
                      value={draft}
                      onChangeText={handleDraftChange}
                      onKeyPress={handleComposerKeyPress}
                      placeholder="Type a message..."
                      placeholderTextColor={colors.textSecondary}
                      multiline
                    />
                    <Pressable
                      style={styles.inlineIconButton}
                      onPress={() => setShowEmojiPicker((prev) => !prev)}
                      accessibilityRole="button"
                      accessibilityLabel="Choose emoji"
                    >
                      <Feather name="smile" size={20} color={showEmojiPicker ? colors.primary : colors.textSecondary} />
                    </Pressable>
                    <Pressable
                      style={styles.inlineIconButton}
                      onPress={handleStartVoiceRecording}
                      disabled={isSendingVoice}
                      accessibilityRole="button"
                      accessibilityLabel="Record voice message"
                    >
                      <Feather name="mic" size={20} color={colors.primary} />
                    </Pressable>
                  </>
                )}

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
  },
  body: { flex: 1, width: '100%' },
  content: { flex: 1, padding: spacing.xl },
  heroText: { ...typography.body, color: colors.textSecondary, textAlign: 'center', lineHeight: 24 },
  thread: { flex: 1 },
  threadContent: { padding: spacing.lg, gap: spacing.md, flexGrow: 1 },
  emptyText: { ...typography.caption, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.xl },
  dateBadgeContainer: { alignItems: 'center', marginVertical: spacing.xs },
  dateBadge: {
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    borderRadius: radius.pill,
    ...shadow.card,
  },
  dateBadgeText: { ...typography.caption, color: colors.textSecondary, fontWeight: '600' },
  bubbleRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.xs },
  bubbleRowLeft: { justifyContent: 'flex-start' },
  bubbleRowRight: { justifyContent: 'flex-end' },
  avatarTile: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  userAvatarTile: { backgroundColor: colors.primary },
  bubbleColumn: { maxWidth: '75%' },
  bubbleColumnLeft: { alignItems: 'flex-start' },
  bubbleColumnRight: { alignItems: 'flex-end' },
  bubble: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.xl,
    ...shadow.card,
  },
  bubbleOfficial: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xs,
  },
  bubbleUser: {
    backgroundColor: colors.primaryLight,
    borderTopRightRadius: radius.xs,
  },
  bubbleText: { ...typography.body, color: colors.textPrimary },
  bubbleTextUser: { color: colors.primaryDark },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  timestamp: { ...typography.caption, color: colors.textSecondary, fontSize: 11 },
  readIcon: { marginLeft: 2 },
  voiceBubble: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minWidth: 160 },
  voicePlayBtn: {
    width: 28, height: 28, borderRadius: radius.pill,
    alignItems: 'center', justifyContent: 'center',
  },
  voicePlayBtnOfficial: { backgroundColor: colors.primary },
  voicePlayBtnUser: { backgroundColor: colors.primaryDark },
  waveform: { flexDirection: 'row', alignItems: 'center', gap: 3, flex: 1 },
  waveformBar: { width: 3, borderRadius: 2 },
  waveformBarOfficial: { backgroundColor: colors.border },
  waveformBarUser: { backgroundColor: colors.primary },
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
  // Updated input container to be rectangular with rounded corners instead of oval/pill
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    paddingLeft: spacing.md,
    paddingRight: spacing.xs,
    paddingVertical: 6,
    ...shadow.card,
  },
  composerInput: {
    flex: 1,
    maxHeight: 100,
    paddingLeft: spacing.xs,
    paddingRight: spacing.xs,
    paddingTop: Platform.OS === 'web' ? 10 : 8,
    paddingBottom: Platform.OS === 'web' ? 10 : 8,
    color: colors.textPrimary,
    ...typography.body,
  },
  inlineIconButton: {
    padding: spacing.xs,
    marginRight: 2,
  },
  actionIconButton: {
    padding: spacing.xs,
  },
  recordingIndicator: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingRight: spacing.xs,
  },
  recordingDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.danger, marginLeft: spacing.xs },
  recordingText: { ...typography.body, color: colors.textPrimary, flex: 1 },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 4,
  },
  sendBtnDisabled: { opacity: 0.5 },
  // Emoji Picker Container & Styles
  emojiPickerContainer: {
    maxHeight: 200,
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  emojiHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
    paddingHorizontal: spacing.xs,
  },
  emojiHeaderText: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  emojiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
  },
  emojiItem: {
    width: '10%',
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emojiText: {
    fontSize: 22,
  },
});