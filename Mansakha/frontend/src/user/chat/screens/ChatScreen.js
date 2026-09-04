import React, { useRef, useState, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, FlatList, TextInput, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors } from '../../shared/theme/colors';
import { spacing } from '../../shared/theme/spacing';
import { radius } from '../../shared/theme/radius';
import { typography } from '../../shared/theme/typography';
import { formContentWidth } from '../../shared/theme/layout';
import { useResponsive } from '../../shared/hooks/useResponsive';
import TopRightActions from '../../shared/components/TopRightActions';
import { useCheckin, useLogChatTurn } from '../../shared/services/hooks';

const OLLAMA = "http://127.0.0.1:11434";
const CHAT = OLLAMA + "/api/chat";
const TAGS = OLLAMA + "/api/tags";
const SYSTEM = `You are Mansakha, a calm and supportive conversational companion. Listen with empathy. Keep replies short and natural. Ask one gentle question at a time. Do not diagnose mental-health conditions. Do not assign risk levels or distress scores. Do not claim to be a doctor, counsellor, lawyer or police officer. Do not claim you contacted anyone. A separate post-conversation distress analysis handles distress scoring. If immediate danger is described, do not ask same question again and again, encourage immediate local emergency help.`;

const EMOJI_LIST = ['😊', '❤️', '👍', '🙏', '🌿', '✨', '🌊', '💡', '🤗', '😌', '💪', '🌸'];

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
  const submitMutation = useCheckin();
  const logChatTurn = useLogChatTurn();
  const [model, setModel] = useState('gemma3:4b');
  const [models, setModels] = useState([]);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [status, setStatus] = useState('Connecting to Ollama...');

  // Call & Video States
  const [inCall, setInCall] = useState(false);
  const [isVideoCall, setIsVideoCall] = useState(false);
  const [facingMode, setFacingMode] = useState('user');
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
  const [showEmojis, setShowEmojis] = useState(false);

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
      const textMessage = `🎤 [Voice Note - ${recordingTime}s]`;
      deleteRecording();
      setShowEmojis(false);
      setStatus("Mansakha is thinking...");
      try {
        await askOllama(textMessage, messages);
        requestAnimationFrame(() => listRef.current?.scrollToEnd?.({ animated: true }));
      } catch (err) {}
      return;
    }

    const text = draft.trim();
    if (!text) return;
    setDraft('');
    setShowEmojis(false);
    setStatus("Mansakha is thinking...");
    try {
      await askOllama(text, messages);
      requestAnimationFrame(() => listRef.current?.scrollToEnd?.({ animated: true }));
    } catch (err) {}
  };

  const toggleVoiceCall = () => {
    if (inCall && !isVideoCall) {
      endCall();
    } else {
      stopMediaStream();
      setIsVideoCall(false);
      setInCall(true);
      setVoiceState("Voice Call Active");
    }
  };

  const toggleVideoCall = async (mode = 'user') => {
    if (inCall && isVideoCall) {
      endCall();
      return;
    }

    if (Platform.OS !== 'web' || !navigator.mediaDevices?.getUserMedia) {
      setIsVideoCall(true);
      setInCall(true);
      setVoiceState("Video Call Active");
      return;
    }

    try {
      stopMediaStream();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: mode },
        audio: true,
      });
      mediaStreamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      setIsVideoCall(true);
      setInCall(true);
      setFacingMode(mode);
      setVoiceState("Video Call Active");
    } catch (err) {
      alert("Could not access camera/microphone: " + err.message);
    }
  };

  const toggleCameraFacing = () => {
    const nextMode = facingMode === 'user' ? 'environment' : 'user';
    toggleVideoCall(nextMode);
  };

  const endCall = () => {
    setInCall(false);
    setIsVideoCall(false);
    stopMediaStream();
    setVoiceState("Call ended");
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

  const isSendActive = draft.trim().length > 0 || isRecording || audioBlob !== null || audioUrl !== null;

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {/* Top Header */}
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
          <Text style={styles.statusTitle}>Mansakha AI Counsellor</Text>
          <Text style={styles.subtext}>{inCall ? voiceState : status}</Text>
        </View>
        <TopRightActions />
      </View>

      <View style={[styles.body, { maxWidth: formContentWidth[tier], width: '100%', alignSelf: 'center', paddingTop: spacing.md }]}>
        {/* Video Overlay UI */}
        {inCall && isVideoCall && (
          <View style={styles.videoContainer}>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              style={{ width: '100%', height: 220, borderRadius: radius.md, backgroundColor: '#000', objectFit: 'cover' }}
            />
            <View style={styles.videoOverlayControls}>
              <Pressable style={styles.videoControlBtn} onPress={toggleCameraFacing}>
                <Feather name="refresh-cw" size={14} color={colors.white} />
                <Text style={styles.videoControlText}>{facingMode === 'user' ? ' Back Camera' : ' Front Camera'}</Text>
              </Pressable>
            </View>
          </View>
        )}

        {/* Message Stream */}
        <FlatList
          ref={listRef}
          data={messages}
          showsVerticalScrollIndicator={false}
          keyExtractor={(_, i) => i.toString()}
          renderItem={({ item }) => <Bubble message={item} />}
          contentContainerStyle={styles.listContent}
        />

        {/* Emoji Selector */}
        {showEmojis && (
          <View style={styles.emojiRowContainer}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.emojiScroll}>
              {EMOJI_LIST.map((e, idx) => (
                <Pressable key={idx} onPress={() => setDraft(prev => prev + e)} style={styles.emojiBtn}>
                  <Text style={{ fontSize: 20 }}>{e}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Dynamic Action Input Panel */}
        <View style={styles.inputSectionContainer}>
          {/* Vertical Icon-Only Recording Overlay Box */}
          {showRecorderBox && (
            <View style={styles.verticalRecorderBox}>
              <View style={styles.recorderTimerHeader}>
                <View style={styles.recordingDot} />
                <Text style={styles.recordingTimeText}>{recordingTime}s</Text>
              </View>

              <View style={styles.verticalActionsContainer}>
                {/* Pause / Play Icon */}
                <Pressable
                  style={[styles.verticalActionIconBtn, { backgroundColor: colors.primary + '15' }]}
                  onPress={isRecording ? pauseVoiceRecording : togglePlayback}
                >
                  <Feather
                    name={isRecording ? (isPaused ? "play" : "pause") : (isPlaying ? "pause" : "play")}
                    size={20}
                    color={colors.primary}
                  />
                </Pressable>

                {/* Delete Icon */}
                <Pressable
                  style={[styles.verticalActionIconBtn, { backgroundColor: colors.danger + '15' }]}
                  onPress={deleteRecording}
                >
                  <Feather name="trash-2" size={20} color={colors.danger} />
                </Pressable>

                {/* Send Icon */}
                <Pressable
                  style={[styles.verticalActionIconBtn, { backgroundColor: colors.primary }]}
                  onPress={handleSend}
                >
                  <Feather name="send" size={18} color={colors.white} />
                </Pressable>
              </View>
            </View>
          )}

          {!showExpandedMenu ? (
            /* NORMAL MODE: Single Input Box with Center Wave Icon */
            <View style={styles.singleInputWrapper}>
              <Pressable
                style={styles.floatingWaveTriggerBtn}
                onPress={() => setShowExpandedMenu(true)}
              >
                <Feather name="activity" size={20} color={colors.white} />
              </Pressable>

              <View style={styles.textInputRow}>
                <Pressable style={styles.iconBtn} onPress={() => setShowEmojis(prev => !prev)}>
                  <Feather name="smile" size={20} color={colors.textSecondary} />
                </Pressable>

                <TextInput
                  style={styles.textInput}
                  placeholder={isRecording || audioUrl ? "Voice note recorded..." : "Type a message..."}
                  placeholderTextColor={colors.textSecondary}
                  value={draft}
                  onChangeText={setDraft}
                  editable={!isRecording && !audioUrl}
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
                >
                  <Feather name="send" size={18} color={colors.white} />
                </Pressable>
              </View>
            </View>
          ) : (
            /* EXPANDED MODE */
            <View style={styles.expandedMenuContainer}>
              <View style={styles.sideActionsGroup}>
                <Pressable
                  style={[styles.actionCircleBtn, inCall && isVideoCall && { backgroundColor: colors.danger }]}
                  onPress={() => toggleVideoCall('user')}
                >
                  <Feather
                    name={inCall && isVideoCall ? "video-off" : "video"}
                    size={18}
                    color={inCall && isVideoCall ? colors.white : colors.textPrimary}
                  />
                </Pressable>
                <Pressable
                  style={[styles.actionCircleBtn, inCall && !isVideoCall && { backgroundColor: colors.danger }]}
                  onPress={toggleVoiceCall}
                >
                  <Feather
                    name={inCall && !isVideoCall ? "phone-off" : "phone"}
                    size={18}
                    color={inCall && !isVideoCall ? colors.white : colors.textPrimary}
                  />
                </Pressable>
              </View>

              <View style={[styles.textInputRow, { flex: 1, marginBottom: 0 }]}>
                <TextInput
                  style={styles.textInput}
                  placeholder="Type..."
                  placeholderTextColor={colors.textSecondary}
                  value={draft}
                  onChangeText={setDraft}
                  onKeyPress={(e) => {
                    if (Platform.OS === 'web' && e.nativeEvent.key === 'Enter' && !e.nativeEvent.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                />
              </View>

              <View style={styles.sideActionsGroup}>
                {/* Always stays a microphone icon; toggles menu on click */}
                <Pressable
                  style={[styles.actionCircleBtn, showRecorderBox && { backgroundColor: colors.primary + '20' }]}
                  onPress={handleRecorderClick}
                >
                  <Feather name="mic" size={18} color={showRecorderBox ? colors.primary : colors.textPrimary} />
                </Pressable>

                <Pressable
                  style={[styles.actionCircleBtn, styles.cancelCircleBtn]}
                  onPress={() => setShowExpandedMenu(false)}
                >
                  <Feather name="x" size={18} color={colors.white} />
                </Pressable>
              </View>
            </View>
          )}
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
  bubbleRow: { flexDirection: 'row', marginBottom: spacing.sm },
  bubbleRowUser: { justifyContent: 'flex-end' },
  bubble: { maxWidth: '80%', borderRadius: radius.lg, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  bubbleAi: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderTopLeftRadius: 4 },
  bubbleUser: { backgroundColor: colors.primary, borderTopRightRadius: 4 },
  bubbleRole: { fontSize: 10, fontWeight: 'bold', opacity: 0.65, marginBottom: 4, color: colors.textPrimary },
  bubbleText: { ...typography.body, color: colors.textPrimary },
  bubbleTextUser: { color: colors.white },

  videoContainer: {
    marginBottom: spacing.md,
    borderRadius: radius.md,
    overflow: 'hidden',
    position: 'relative',
  },
  videoOverlayControls: { position: 'absolute', bottom: 8, right: 8 },
  videoControlBtn: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.pill,
  },
  videoControlText: { color: colors.white, fontSize: 12, fontWeight: '600' },

  emojiRowContainer: {
    backgroundColor: colors.surface, borderRadius: radius.md,
    paddingVertical: 6, paddingHorizontal: 8, marginBottom: 8,
    borderWidth: 1, borderColor: colors.border,
  },
  emojiScroll: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  emojiBtn: { padding: 4 },

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
  floatingWaveTriggerBtn: {
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
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  iconBtn: { padding: 6 },
  textInput: {
    flex: 1, ...typography.body, color: colors.textPrimary,
    maxHeight: 100, paddingHorizontal: 8,
    paddingTop: Platform.OS === 'web' ? 10 : 8,
    paddingBottom: Platform.OS === 'web' ? 10 : 8,
    outlineStyle: 'none',
  },
  sendBtn: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center', marginLeft: 4,
  },
  sendBtnDisabled: { opacity: 0.5 },

  expandedMenuContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: colors.border,
    elevation: 3,
  },
  sideActionsGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  actionCircleBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelCircleBtn: {
    backgroundColor: colors.textSecondary,
  },
});