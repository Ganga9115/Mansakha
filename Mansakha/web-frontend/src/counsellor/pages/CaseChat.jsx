import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import StaffLayout from '../layouts/StaffLayout';
import { ArrowLeft, Phone, Mic, Send, Play, Pause } from 'lucide-react';
import { useCaseDetail, useCaseMessages, useSendCaseMessage, useSendCaseVoiceMessage, useSendTypingPing } from '../services/hooks';
import { useToast } from '../../shared/context/ToastContext';

// Wrapped in StaffLayout (top bar + sidebar stay visible, per the user's
// explicit call) - the chat itself still fills the available height as one
// tall card, with its own slim internal header (who-you're-talking-to +
// call icon), a full-height scrollable thread, and a composer pinned to the
// card's bottom, so it still reads like the mobile app's user<->AI chat
// screen rather than a small embedded widget.
const TYPING_PING_INTERVAL_MS = 1500;

// Static decorative "waveform" for voice bubbles - a fixed row of bar
// heights, not a real amplitude readout (no client-side audio analysis
// happening here), just enough visual texture to read as a voice message.
const WAVEFORM_BARS = [3, 7, 11, 6, 9, 4, 8, 12, 5, 9, 3];

function formatDuration(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds || 0));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

function formatTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function pickRecorderMimeType() {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/ogg', 'audio/mp4'];
  if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported) return undefined;
  return candidates.find((type) => MediaRecorder.isTypeSupported(type));
}

export default function CaseChat() {
  const { id: userId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { data: caseData } = useCaseDetail(userId);
  const { data, loading, refetch } = useCaseMessages(userId);
  const sendMessage = useSendCaseMessage(userId);
  const sendVoiceMessage = useSendCaseVoiceMessage(userId);
  const sendTypingPing = useSendTypingPing(userId);
  const [draft, setDraft] = useState('');
  const lastTypingPingRef = useRef(0);
  const listEndRef = useRef(null);

  // Voice recording state (MediaRecorder-backed) - `recordSecondsRef` mirrors
  // `recordSeconds` so the recorder's onstop closure (created once at
  // recorder.start() time) can read the final elapsed duration without
  // going stale.
  const [isRecording, setIsRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [recordError, setRecordError] = useState('');
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const streamRef = useRef(null);
  const recordTimerRef = useRef(null);
  const recordSecondsRef = useRef(0);

  // Voice playback - one shared <audio> element re-pointed at whichever
  // bubble is currently playing, rather than one element per message.
  const audioRef = useRef(null);
  const [playingMessageId, setPlayingMessageId] = useState(null);
  if (!audioRef.current && typeof Audio !== 'undefined') {
    audioRef.current = new Audio();
  }

  // Polled every 3s while this page is open (mirrors the mobile side) so a
  // message the user sends - and the otherPartyTyping flag - shows up here
  // without a manual refresh.
  useEffect(() => {
    const interval = setInterval(() => refetch(), 3000);
    return () => clearInterval(interval);
  }, [refetch]);

  useEffect(() => {
    listEndRef.current?.scrollIntoView({ block: 'end' });
  }, [data?.messages?.length]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return undefined;
    const handleEnded = () => setPlayingMessageId(null);
    audio.addEventListener('ended', handleEnded);
    return () => audio.removeEventListener('ended', handleEnded);
  }, []);

  // Stop any in-progress recording/playback if the counsellor navigates away
  // mid-recording.
  useEffect(() => () => {
    clearInterval(recordTimerRef.current);
    streamRef.current?.getTracks().forEach((track) => track.stop());
    audioRef.current?.pause();
  }, []);

  const handleSend = async () => {
    const text = draft.trim();
    if (!text) return;
    setDraft('');
    await sendMessage.mutate(text);
    refetch();
  };

  const handleDraftChange = (e) => {
    setDraft(e.target.value);
    const now = Date.now();
    // Throttled to roughly once every 1.5s while actively typing - not on
    // every keystroke.
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
    // Shift+Enter falls through and inserts a newline normally.
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
        try {
          await sendVoiceMessage.mutate(blob, finalDuration);
          refetch();
        } catch (err) {
          const message = err.message || 'Could not send voice message';
          setRecordError(message);
          toast.error(message);
        }
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setRecordSeconds(0);
      recordSecondsRef.current = 0;
      setIsRecording(true);
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

  const stopRecording = () => {
    clearInterval(recordTimerRef.current);
    recordTimerRef.current = null;
    setIsRecording(false);
    mediaRecorderRef.current?.stop();
  };

  const handleMicClick = () => {
    if (isRecording) stopRecording();
    else startRecording();
  };

  return (
    <StaffLayout title={`Chat: ${userId.slice(0, 8)}`}>
      <div className="h-[calc(100vh-8rem)] flex flex-col bg-white rounded-xl border border-gray-200/80 shadow-sm overflow-hidden">
        {/* Slim internal header - just back + call. No case-id/"Chat with
            User" label here - StaffLayout's own title bar already says
            "Chat: {id}", so repeating it just eats into the chat's own
            space for no reason. */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 bg-blue-50/60 shrink-0">
          <button
            onClick={() => navigate(`/counsellor/case-detail/${userId}`)}
            className="p-1.5 -ml-1 rounded-full hover:bg-white/70 transition text-[#3D5A80]"
            aria-label="Back to Case File"
          >
            <ArrowLeft size={20} />
          </button>
          {caseData?.phone && (
            <a
              href={`tel:${caseData.phone}`}
              className="p-2 rounded-full border border-emerald-500 text-emerald-600 hover:bg-emerald-50 transition shrink-0"
              title="Call User"
              aria-label="Call User"
            >
              <Phone size={16} />
            </a>
          )}
        </div>

        {/* Message thread - fills remaining height, scrolls on its own */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 no-scrollbar">
          {loading && !data ? (
            <p className="text-xs text-gray-400">Loading messages...</p>
          ) : (data?.messages || []).length === 0 ? (
            <p className="text-xs text-gray-400">No messages yet.</p>
          ) : data.messages.map((m) => {
            const isOfficial = m.senderType === 'official';
            const isPlaying = playingMessageId === m.messageId;
            return (
              <div key={m.messageId} className={`flex flex-col ${isOfficial ? 'items-end' : 'items-start'}`}>
                <div className={`max-w-[75%] px-3.5 py-2.5 rounded-2xl text-xs leading-relaxed ${isOfficial ? 'bg-[#519BCE] text-white rounded-tr-sm' : 'bg-gray-100 text-gray-800 rounded-tl-sm'}`}>
                  {m.messageType === 'voice' ? (
                    <div className="flex items-center gap-2 min-w-[140px]">
                      <button
                        type="button"
                        onClick={() => handleTogglePlay(m)}
                        className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center transition ${isOfficial ? 'bg-white/20 hover:bg-white/30' : 'bg-white hover:bg-gray-50 border border-gray-200'}`}
                        aria-label={isPlaying ? 'Pause voice message' : 'Play voice message'}
                      >
                        {isPlaying ? <Pause size={13} /> : <Play size={13} className="ml-0.5" />}
                      </button>
                      <div className="flex-1 flex items-end gap-0.5 h-4">
                        {WAVEFORM_BARS.map((h, i) => (
                          <span
                            key={i}
                            className={`w-0.5 rounded-full ${isOfficial ? 'bg-white/60' : 'bg-gray-400'}`}
                            style={{ height: `${h}px` }}
                          />
                        ))}
                      </div>
                      <span className={`shrink-0 text-[11px] tabular-nums ${isOfficial ? 'text-white/90' : 'text-gray-500'}`}>
                        {formatDuration(m.durationSeconds)}
                      </span>
                    </div>
                  ) : (
                    m.body
                  )}
                </div>
                <span className="text-[10px] text-gray-400 mt-1 px-1">{formatTime(m.sentAt)}</span>
              </div>
            );
          })}
          <div ref={listEndRef} />
        </div>

        {data?.otherPartyTyping && (
          <p className="px-4 pb-1 text-[11px] text-gray-400 italic shrink-0">User is typing...</p>
        )}

        {/* Composer - a floating white rounded-pill bar with margin around it
            against the card's light-gray footer strip, holding a borderless
            auto-growing textarea, a mic button (recording toggle), and a
            filled-blue send button - matching the reference screenshot. */}
        <div className="border-t border-gray-200 bg-gray-50 px-3 py-3 shrink-0">
          <div className="flex items-center gap-1.5 bg-white rounded-full border border-gray-200 shadow-md px-2 py-1.5">
            {isRecording ? (
              <div className="flex-1 flex items-center gap-2 px-3 py-1.5 text-xs text-red-500 font-medium">
                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse shrink-0" />
                Recording {formatDuration(recordSeconds)}
              </div>
            ) : (
              <textarea
                rows={1}
                value={draft}
                onChange={handleDraftChange}
                onKeyDown={handleKeyDown}
                placeholder="Type a message..."
                className="flex-1 px-3 py-1.5 bg-transparent border-0 outline-none resize-none text-xs max-h-24 overflow-y-auto"
              />
            )}
            <button
              type="button"
              onClick={handleMicClick}
              className={`shrink-0 p-2.5 rounded-full border transition ${isRecording ? 'bg-red-500 border-red-500 text-white animate-pulse' : 'border-gray-300 text-gray-500 hover:bg-gray-50'}`}
              aria-label={isRecording ? 'Stop recording' : 'Record voice message'}
              title={isRecording ? 'Stop recording' : 'Record voice message'}
            >
              <Mic size={16} />
            </button>
            <button
              type="button"
              onClick={handleSend}
              disabled={sendMessage.loading || !draft.trim() || isRecording}
              className="shrink-0 p-2.5 rounded-full bg-[#519BCE] hover:bg-[#3d83b3] text-white disabled:opacity-40 disabled:hover:bg-[#519BCE] transition"
              aria-label="Send message"
              title="Send message"
            >
              <Send size={16} />
            </button>
          </div>
          {recordError && <p className="text-[11px] text-red-500 px-3 pt-1.5">{recordError}</p>}
        </div>
      </div>
    </StaffLayout>
  );
}
