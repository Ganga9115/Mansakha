import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, TextInput, KeyboardAvoidingView, Platform, Linking, Modal, Animated } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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

// WhatsApp-style "typing..." indicator, rendered as a real received-message
// bubble (same avatar/bubble shape as any other counsellor message) at the
// bottom of the thread rather than static text above the composer - driven
// entirely by `otherPartyTyping`, which the messages poll already surfaces
// server-side (see useCounsellorMessages/the typing-ping backend route), so
// this only changes how that real state is presented, not what drives it.
function TypingBubble() {
  const dots = useRef([0, 1, 2].map(() => new Animated.Value(0))).current;

  useEffect(() => {
    const loops = dots.map((value, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 150),
          Animated.timing(value, { toValue: 1, duration: 300, useNativeDriver: true }),
          Animated.timing(value, { toValue: 0, duration: 300, useNativeDriver: true }),
          Animated.delay((2 - i) * 150),
        ])
      )
    );
    loops.forEach((l) => l.start());
    return () => {
      loops.forEach((l) => l.stop());
      dots.forEach((v) => v.setValue(0));
    };
  }, []);

  return (
    <View style={[styles.bubbleRow, styles.bubbleRowLeft]}>
      <View style={styles.avatarTile}>
        <Feather name="user" size={16} color={colors.primary} />
      </View>
      <View style={[styles.bubble, styles.bubbleOfficial, styles.typingBubble]}>
        {dots.map((value, i) => (
          <Animated.View
            key={i}
            style={[
              styles.typingDot,
              {
                opacity: value.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] }),
                transform: [{ translateY: value.interpolate({ inputRange: [0, 1], outputRange: [0, -4] }) }],
              },
            ]}
          />
        ))}
      </View>
    </View>
  );
}

export default function CounsellorChatScreen({ navigation }) {
  const { tier, isDesktop } = useResponsive();
  const insets = useSafeAreaInsets();
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

  // Accepts an optional override so the "Enter/Send" native-keyboard path
  // below can send the just-typed text directly instead of round-tripping
  // through `draft` state (which hasn't re-rendered yet at that point).
  const handleSend = async (overrideText) => {
    if (recorderState.isRecording || isPaused) {
      handleFinishVoiceRecording();
      return;
    }

    const text = (overrideText ?? draft).trim();
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
    // On Android/iOS, a multiline TextInput inserts a literal "\n" when the
    // keyboard's own Enter/Send key is pressed - there's no reliable way to
    // intercept and suppress that before it commits (unlike the web path in
    // handleComposerKeyPress below, which can call preventDefault). Treating
    // a newly-typed trailing newline as "Send" mirrors this screen's
    // existing web Enter-to-send behaviour on mobile too, so the keyboard's
    // Send/Enter key works exactly like tapping the Send button.
    if (Platform.OS !== 'web' && text.endsWith('\n') && !draft.endsWith('\n')) {
      handleSend(text.slice(0, -1));
      return;
    }
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
    <KeyboardAvoidingView 
      style={styles.container} 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={[styles.topHeader, !isDesktop && { paddingTop: insets.top + spacing.xs, paddingBottom: spacing.sm }]}>
        {tier !== 'desktop' && (
          <Pressable onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={8}>
            <Feather name="arrow-left" size={20} color={colors.primaryDark} />
          </Pressable>
        )}
        <View style={styles.headerLeft}>
          {isDesktop ? (
            <Feather color={colors.primaryDark} name="user" size={24} style={styles.headerIconDesktop}/>
          ) : (
            <View style={styles.avatarContainer}>
              <Feather color={colors.primaryDark} name="user" size={28}/>
            </View>
          )}

          <View style={styles.nameBlock}>
            <Text style={styles.statusTitle}>{counsellor?.fullName || 'My Counsellor'}</Text>
            <Text style={styles.subtext}>Private, opted-in support</Text>
          </View>
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

              {otherPartyTyping && <TypingBubble />}
            </ScrollView>

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
                      onSubmitEditing={() => handleSend()}
                      blurOnSubmit={false}
                      placeholder="Type a message..."
                      placeholderTextColor={colors.textSecondary}
                      returnKeyType="send"
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
                  onPress={() => handleSend()}
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
    paddingTop: Platform.OS === 'ios' ? 48 : spacing.lg,
    paddingBottom: spacing.lg,
    paddingHorizontal: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerIconDesktop: {
    marginRight: spacing.sm,
  },
  avatarContainer: {
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  backBtn: { marginRight: spacing.sm, padding: spacing.xs },
  nameBlock: { flexShrink: 1 },
  statusTitle: {
    ...typography.h1,
    color: colors.primaryDark,
    fontSize: 20,
    fontWeight: '700',
  },
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
  // WhatsApp-style typing bubble - same bubble shape as a real message, just
  // three animated dots instead of text.
  typingBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: spacing.md + 2,
  },
  typingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.textSecondary,
  },
  composerContainer: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.background,
  },
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