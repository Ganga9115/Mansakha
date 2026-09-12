import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from "react-router-dom";
import StaffLayout from '../layouts/StaffLayout';
import { 
  ArrowLeft, 
  Phone, 
  Mic, 
  Send, 
  Play, 
  Pause, 
  Smile, 
  User, 
  CheckCircle2, 
  Trash2, 
  X 
} from 'lucide-react';
import { useCaseMessages, useSendCaseMessage, useSendCaseVoiceMessage, useSendTypingPing } from '../services/hooks';
import { useToast } from '../../shared/context/ToastContext';

const TYPING_PING_INTERVAL_MS = 1500;

// WhatsApp-style static waveform bars matching the exact lengths from reference
const WAVEFORM_BAR_HEIGHTS = [6, 12, 8, 16, 10, 14, 7, 11];

// Quick selection emoji list
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

function formatDuration(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds || 0));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

function formatTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function getDateLabel(iso) {
  if (!iso) return 'Today';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Today';
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const isSameDay = (d1, d2) =>
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate();
  if (isSameDay(d, today)) return 'Today';
  if (isSameDay(d, yesterday)) return 'Yesterday';
  return d.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
}

function groupMessagesByDate(messages) {
  const groups = [];
  let currentGroup = null;
  messages.forEach((msg) => {
    const label = getDateLabel(msg.sentAt);
    if (!currentGroup || currentGroup.label !== label) {
      currentGroup = { label, data: [] };
      groups.push(currentGroup);
    }
    currentGroup.data.push(msg);
  });
  return groups;
}

function pickRecorderMimeType() {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/ogg', 'audio/mp4'];
  if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported) return undefined;
  return candidates.find((type) => MediaRecorder.isTypeSupported(type));
}

// Animated "user is typing..." message bubble matching the React Native implementation
function TypingBubble() {
  return (
    <div className="flex items-end gap-2 justify-start my-1">
      <div className="w-8 h-8 rounded-full bg-[#EBF3FA] flex items-center justify-center shrink-0">
        <User size={16} className="text-[#3D5A80]" />
      </div>
      <div className="bg-white border border-gray-100 shadow-sm rounded-2xl rounded-tl-xs px-4 py-3 flex items-center gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce [animation-delay:-0.3s]" />
        <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce [animation-delay:-0.15s]" />
        <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" />
      </div>
    </div>
  );
}

export default function CaseChat() {
  const { id: userId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { data, loading, refetch } = useCaseMessages(userId);
  const sendMessage = useSendCaseMessage(userId);
  const sendVoiceMessage = useSendCaseVoiceMessage(userId);
  const sendTypingPing = useSendTypingPing(userId);
  
  const [draft, setDraft] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const lastTypingPingRef = useRef(0);
  const listEndRef = useRef(null);

  // Voice recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [recordError, setRecordError] = useState('');
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const streamRef = useRef(null);
  const recordTimerRef = useRef(null);
  const recordSecondsRef = useRef(0);

  // Shared audio playback
  const audioRef = useRef(null);
  const [playingMessageId, setPlayingMessageId] = useState(null);
  if (!audioRef.current && typeof Audio !== 'undefined') {
    audioRef.current = new Audio();
  }

  useEffect(() => {
    const interval = setInterval(() => refetch(), 3000);
    return () => clearInterval(interval);
  }, [refetch]);

  useEffect(() => {
    listEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [data?.messages?.length, data?.otherPartyTyping]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return undefined;
    const handleEnded = () => setPlayingMessageId(null);
    audio.addEventListener('ended', handleEnded);
    return () => audio.removeEventListener('ended', handleEnded);
  }, []);

  useEffect(() => () => {
    clearInterval(recordTimerRef.current);
    streamRef.current?.getTracks().forEach((track) => track.stop());
    audioRef.current?.pause();
  }, []);

  const handleSend = async () => {
    const text = draft.trim();
    if (!text) return;
    setDraft('');
    setShowEmojiPicker(false);
    await sendMessage.mutate(text);
    refetch();
  };

  const handleDraftChange = (e) => {
    setDraft(e.target.value);
    const now = Date.now();
    if (now - lastTypingPingRef.current > TYPING_PING_INTERVAL_MS) {
      lastTypingPingRef.current = now;
      sendTypingPing();
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSelectEmoji = (emoji) => {
    setDraft((prev) => prev + emoji);
  };

  const handleTogglePlay = (m) => {
    const audio = audioRef.current;
    if (!audio || !m.audioUrl) return;
    if (playingMessageId === m.messageId) {
      audio.pause();
      setPlayingMessageId(null);
      return;
    }
    audio.src = m.audioUrl;
    audio.currentTime = 0;
    audio.play().catch(() => {});
    setPlayingMessageId(m.messageId);
  };

  const startRecording = async () => {
    setRecordError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = pickRecorderMimeType();
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        const finalDuration = recordSecondsRef.current;
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || mimeType || 'audio/webm' });
        chunksRef.current = [];
        streamRef.current?.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        if (finalDuration > 0) {
          try {
            await sendVoiceMessage.mutate(blob, finalDuration);
            refetch();
          } catch (err) {
            const message = err.message || 'Could not send voice message';
            setRecordError(message);
            toast.error(message);
          }
        }
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setRecordSeconds(0);
      recordSecondsRef.current = 0;
      setIsRecording(true);
      setIsPaused(false);
      recordTimerRef.current = setInterval(() => {
        recordSecondsRef.current += 1;
        setRecordSeconds(recordSecondsRef.current);
      }, 1000);
    } catch (err) {
      const message = err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError'
        ? 'Microphone access was denied. Allow microphone permission to send a voice message.'
        : 'Could not access a microphone on this device.';
      setRecordError(message);
      toast.error(message);
    }
  };

  const stopAndSendRecording = () => {
    clearInterval(recordTimerRef.current);
    recordTimerRef.current = null;
    setIsRecording(false);
    setIsPaused(false);
    mediaRecorderRef.current?.stop();
  };

  const cancelRecording = () => {
    clearInterval(recordTimerRef.current);
    recordTimerRef.current = null;
    recordSecondsRef.current = 0;
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.onstop = null;
      mediaRecorderRef.current.stop();
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setIsRecording(false);
    setIsPaused(false);
    setRecordSeconds(0);
  };

  const togglePauseRecording = () => {
    if (!mediaRecorderRef.current) return;
    if (isPaused) {
      mediaRecorderRef.current.resume();
      recordTimerRef.current = setInterval(() => {
        recordSecondsRef.current += 1;
        setRecordSeconds(recordSecondsRef.current);
      }, 1000);
      setIsPaused(false);
    } else {
      mediaRecorderRef.current.pause();
      clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
      setIsPaused(true);
    }
  };

  const sendDisabled = (!draft.trim() && !isRecording) || sendMessage.loading;
  const messageGroups = groupMessagesByDate(data?.messages || []);

  return (
    <StaffLayout title={`Chat: ${userId ? userId.slice(0, 8) : ''}`}>
      <div className="h-[calc(100vh-8rem)] flex flex-col bg-white rounded-2xl border border-gray-200/80 shadow-sm overflow-hidden">
        
        {/* ── Header — white background, matches victim app ── */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-white shrink-0 shadow-sm">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(`/counsellor/case-detail/${userId}`)}
              className="p-1.5 -ml-1 rounded-full hover:bg-gray-100 transition text-gray-600"
              aria-label="Back to Case File"
            >
              <ArrowLeft size={20} />
            </button>
            <div className="w-10 h-10 rounded-full bg-[#EBF3FA] border border-[#CBD5E1] flex items-center justify-center shrink-0">
              <User size={20} className="text-[#3D5A80]" />
            </div>
            <div className="flex flex-col">
              <h1 className="text-sm font-bold text-[#0F172A] leading-tight">
                {data?.userName || 'User Support'}
              </h1>
              <p className="text-xs text-[#64748B]">Private, opted-in support</p>
            </div>
          </div>

          {/* ── Green call button — always visible ── */}
          <a
            href={data?.phone ? `tel:${data.phone}` : undefined}
            className="w-10 h-10 rounded-full border-2 border-[#22C55E] bg-white flex items-center justify-center text-[#22C55E] hover:bg-emerald-50 active:bg-emerald-100 transition shrink-0 shadow-sm"
            title={data?.phone ? `Call ${data.userName || 'User'}` : 'No phone number on file'}
            aria-label="Call User"
          >
            <Phone size={18} />
          </a>
        </div>

        {/* ── Scrollable message thread ── */}
        <div className="flex-1 overflow-y-auto px-4 py-6 space-y-6 no-scrollbar bg-white">
          {loading && !data ? (
            <p className="text-xs text-center text-gray-400 mt-8">Loading messages...</p>
          ) : messageGroups.length === 0 ? (
            <p className="text-xs text-center text-gray-400 mt-8">No messages yet — say hello.</p>
          ) : (
            messageGroups.map((group) => (
              <div key={group.label} className="space-y-4">
                {/* Date badge */}
                <div className="flex justify-center mb-2">
                  <span className="bg-white px-4 py-1.5 rounded-full border border-gray-100 shadow-sm text-[11px] font-semibold text-gray-400">
                    {group.label}
                  </span>
                </div>

                {group.data.map((m) => {
                  const isUser = m.senderType === 'user';
                  const isVoice = m.messageType === 'voice';
                  const isThisPlaying = isVoice && playingMessageId === m.messageId;

                  return (
                    <div
                      key={m.messageId}
                      className={`flex items-end gap-3 ${isUser ? 'justify-start' : 'justify-end'}`}
                    >
                      {/* Victim avatar — left, light blue */}
                      {isUser && (
                        <div className="w-8 h-8 rounded-full bg-[#F0F4F8] flex items-center justify-center shrink-0 mb-6">
                          <User size={16} className="text-[#3D5A80]" />
                        </div>
                      )}

                      <div className={`flex flex-col max-w-[70%] ${isUser ? 'items-start' : 'items-end'}`}>
                        {isVoice ? (
                          <button
                            type="button"
                            onClick={() => handleTogglePlay(m)}
                            className={`flex items-center gap-3 px-5 py-3 rounded-3xl shadow-sm transition min-w-[170px] ${
                              isUser
                                ? 'bg-white border border-gray-100 text-[#0F172A]'
                                : 'bg-[#F0F4F8] text-[#1E293B]'
                            }`}
                          >
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-white ${isUser ? 'bg-[#3D5A80]' : 'bg-[#1E293B]'}`}>
                              {isThisPlaying ? <Pause size={14} /> : <Play size={14} className="ml-1" />}
                            </div>
                            <div className="flex-1 flex items-center gap-0.5 h-4">
                              {WAVEFORM_BAR_HEIGHTS.map((h, idx) => (
                                <span key={idx} className={`w-0.5 rounded-full ${isUser ? 'bg-gray-300' : 'bg-[#3D5A80]/40'}`} style={{ height: `${h}px` }} />
                              ))}
                            </div>
                            <span className={`text-xs font-medium tabular-nums ${isUser ? 'text-[#0F172A]' : 'text-[#1E293B]'}`}>
                              {formatDuration(m.durationSeconds)}
                            </span>
                          </button>
                        ) : (
                          <div className={`px-5 py-2.5 rounded-3xl shadow-sm text-[15px] leading-relaxed ${
                            isUser
                              ? 'bg-white text-[#0F172A] border border-gray-100'
                              : 'bg-[#F0F4F8] text-[#1E293B]'
                          }`}>
                            {m.body}
                          </div>
                        )}

                        <div className="flex items-center gap-1 mt-1.5 px-2">
                          <span className="text-[10px] text-gray-400 font-medium">{formatTime(m.sentAt)}</span>
                          {!isUser && <CheckCircle2 size={11} className="text-[#93C5FD]" />}
                        </div>
                      </div>

                      {/* Counsellor avatar — right, dark blue filled */}
                      {!isUser && (
                        <div className="w-8 h-8 rounded-full bg-[#7CA8D8] flex items-center justify-center shrink-0 text-white mb-6">
                          <User size={16} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))
          )}

          {data?.otherPartyTyping && <TypingBubble />}
          <div ref={listEndRef} />
        </div>

        {/* Emoji Grid Popup */}
        {showEmojiPicker && (
          <div className="bg-white border-t border-gray-200 p-3 max-h-48 overflow-y-auto shrink-0 shadow-lg">
            <div className="flex justify-between items-center mb-2 px-1">
              <span className="text-xs font-semibold text-[#64748B]">Select Emoji</span>
              <button
                type="button"
                onClick={() => setShowEmojiPicker(false)}
                className="text-gray-400 hover:text-gray-600 transition"
              >
                <X size={18} />
              </button>
            </div>
            <div className="grid grid-cols-10 gap-1 text-center">
              {QUICK_EMOJIS.map((emoji, index) => (
                <button
                  key={index}
                  type="button"
                  onClick={() => handleSelectEmoji(emoji)}
                  className="p-1.5 text-xl hover:bg-gray-100 rounded transition"
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Composer bar ── */}
        <div className="px-4 pb-6 pt-2 bg-white shrink-0">
          <div className="flex items-center gap-2 bg-white rounded-[28px] border border-gray-100 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] px-4 py-2.5 max-w-5xl mx-auto">
            {isRecording ? (
              <div className="flex-1 flex items-center gap-3 px-2 py-1.5">
                <button
                  type="button"
                  onClick={cancelRecording}
                  className="text-red-500 p-1.5 hover:bg-red-50 rounded-full transition"
                  title="Delete recording"
                  aria-label="Delete recording"
                >
                  <Trash2 size={20} />
                </button>
                <button
                  type="button"
                  onClick={togglePauseRecording}
                  className="text-[#93C5FD] p-1.5 hover:bg-blue-50 rounded-full transition"
                  title={isPaused ? 'Resume recording' : 'Pause recording'}
                  aria-label={isPaused ? 'Resume recording' : 'Pause recording'}
                >
                  {isPaused ? <Play size={20} /> : <Pause size={20} />}
                </button>
                <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
                <span className="text-sm font-medium text-gray-700 flex-1 ml-2">
                  {isPaused ? 'Paused' : 'Recording...'} {formatDuration(recordSeconds)}
                </span>
              </div>
            ) : (
              <>
                <textarea
                  rows={1}
                  value={draft}
                  onChange={handleDraftChange}
                  onKeyDown={handleKeyDown}
                  placeholder="Type a message..."
                  className="flex-1 px-4 py-2 bg-transparent border-0 outline-none resize-none text-[15px] text-[#0F172A] placeholder-gray-400 max-h-24"
                />
                <button
                  type="button"
                  onClick={() => setShowEmojiPicker((prev) => !prev)}
                  className={`p-2.5 transition rounded-full hover:bg-gray-50 ${
                    showEmojiPicker ? 'text-[#93C5FD]' : 'text-gray-400'
                  }`}
                  aria-label="Choose emoji"
                >
                  <Smile size={22} />
                </button>
                <button
                  type="button"
                  onClick={startRecording}
                  className="p-2.5 text-gray-400 hover:text-[#93C5FD] hover:bg-blue-50 rounded-full transition"
                  aria-label="Record voice message"
                >
                  <Mic size={22} />
                </button>
              </>
            )}

            <button
              type="button"
              onClick={isRecording ? stopAndSendRecording : handleSend}
              disabled={sendDisabled}
              className="w-11 h-11 rounded-full bg-[#9CA3AF] hover:bg-[#93C5FD] text-white flex items-center justify-center shrink-0 disabled:opacity-40 transition shadow-sm ml-1"
              aria-label="Send message"
            >
              <Send size={18} className="mr-0.5 mt-0.5" />
            </button>
          </div>
          {recordError && <p className="text-xs text-red-500 px-6 pt-2">{recordError}</p>}
        </div>

      </div>
    </StaffLayout>
  );
}