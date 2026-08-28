import React, { useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import StaffLayout from '../../../layouts/StaffLayout';
import { ArrowUpRight, ArrowDownRight, Minus, MessageCircle, CalendarPlus } from 'lucide-react';
import {
  useCaseDetail,
  useCaseNotes,
  useAddCaseNote,
  useCompleteIntervention,
  useInterventionTypes,
  useCaseMessages,
  useSendCaseMessage,
  useScheduleSession,
} from '../../../services/hooks';

const RISK_BADGE = {
  Critical: 'bg-purple-100 text-purple-700',
  High: 'bg-rose-100 text-rose-700',
  Moderate: 'bg-amber-100 text-amber-700',
  Low: 'bg-emerald-100 text-emerald-700',
};

const TREND_META = {
  escalating: { icon: ArrowUpRight, color: 'text-red-600', label: 'Escalating' },
  stable_or_improving: { icon: ArrowDownRight, color: 'text-emerald-600', label: 'Stable or improving' },
  insufficient_data: { icon: Minus, color: 'text-gray-400', label: 'Insufficient data' },
};

export default function CaseDetail() {
  const { id: victimId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { data, loading, error, refetch } = useCaseDetail(victimId);
  const notesQuery = useCaseNotes(victimId);
  const addNote = useAddCaseNote(victimId);
  const completeIntervention = useCompleteIntervention(victimId);
  const interventionTypesQuery = useInterventionTypes();
  const scheduleSession = useScheduleSession(victimId);
  const [noteText, setNoteText] = useState('');
  const [showChat, setShowChat] = useState(false);
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleStatus, setScheduleStatus] = useState(null);

  // District/State Admin reach this same screen (App.js routes
  // /districtadmin/case-detail/:id and /stateadmin/case-detail/:id here) for
  // a read-only view - Administration never gets intervention-logging or
  // note-composing actions, per the PS's explicit Counsellor/Administration
  // split, so those controls are hidden (not disabled) outside /counsellor.
  const section = location.pathname.startsWith('/districtadmin') ? 'districtadmin'
    : location.pathname.startsWith('/stateadmin') ? 'stateadmin'
    : 'counsellor';
  const readOnly = section !== 'counsellor';

  const handleAddNote = async () => {
    if (!noteText.trim()) return;
    await addNote.mutate(noteText.trim());
    setNoteText('');
    notesQuery.refetch();
  };

  const handleComplete = async () => {
    await completeIntervention.mutate(data.interventionId);
    refetch();
  };

  const handleSchedule = async () => {
    if (!scheduleDate) return;
    setScheduleStatus(null);
    try {
      await scheduleSession.mutate(new Date(scheduleDate).toISOString());
      setScheduleStatus('Session scheduled.');
      setScheduleDate('');
    } catch (err) {
      setScheduleStatus(err.message || 'Could not schedule this session.');
    }
  };

  if (loading) {
    return <StaffLayout title="Case File" section={section}><p className="text-sm text-gray-400">Loading...</p></StaffLayout>;
  }
  if (error) {
    return <StaffLayout title="Case File" section={section}><div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm px-4 py-3 rounded-lg">{error}</div></StaffLayout>;
  }

  const trend = TREND_META[data.trend] || TREND_META.insufficient_data;
  const TrendIcon = trend.icon;

  return (
    <StaffLayout title={`Case File: ${victimId.slice(0, 8)}`} section={section}>
      <div className="space-y-6">

        {/* TOP SUMMARY HEADER */}
        <div className="bg-white p-5 rounded-xl border border-gray-200/80 shadow-sm flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-10 flex-wrap">
            <div>
              <span className="text-[10px] font-bold tracking-wider text-gray-400 uppercase block">Case ID</span>
              <span className="text-base font-bold text-gray-800">{victimId.slice(0, 8)}</span>
            </div>
            <div>
              <span className="text-[10px] font-bold tracking-wider text-gray-400 uppercase block mb-1">Risk Level</span>
              <span className={`text-xs font-bold px-2.5 py-0.5 rounded ${RISK_BADGE[data.riskLevel] || 'bg-gray-100 text-gray-600'}`}>
                {data.riskLevel}
              </span>
            </div>
            <div>
              <span className="text-[10px] font-bold tracking-wider text-gray-400 uppercase block">Distress Score</span>
              <span className="font-bold text-xs text-gray-800">{data.score}/100 {data.previousScore != null && <span className="text-gray-400 font-normal">(was {data.previousScore})</span>}</span>
            </div>
            <div>
              <span className="text-[10px] font-bold tracking-wider text-gray-400 uppercase block">Trend</span>
              <span className={`flex items-center gap-1 text-xs font-bold mt-0.5 ${trend.color}`}>
                <TrendIcon size={14} /> {trend.label}
              </span>
            </div>
            <div>
              <span className="text-[10px] font-bold tracking-wider text-gray-400 uppercase block">Intervention</span>
              <span className="text-xs font-bold text-gray-700">{data.interventionStatus}</span>
            </div>
          </div>

          {!readOnly && (
            <div className="flex items-center gap-3 flex-wrap justify-end">
              {data.phone && (
                <>
                  <a href={`tel:${data.phone}`} className="px-4 py-2 border border-emerald-500 text-emerald-600 rounded-lg text-xs font-medium hover:bg-emerald-50 transition flex items-center gap-2">
                    <MessageCircle size={14} /> Call Victim
                  </a>
                  <a href={`https://wa.me/${data.phone.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" className="px-4 py-2 bg-emerald-500 text-white rounded-lg text-xs font-medium shadow-sm hover:bg-emerald-600 transition flex items-center gap-2">
                    <MessageCircle size={14} /> WhatsApp
                  </a>
                </>
              )}
            </div>
          )}
        </div>

        <div className="grid grid-cols-3 gap-6">

          {/* LEFT COLUMN */}
          <div className="col-span-2 space-y-6">

            {/* Contributing signals */}
            <div className="bg-white p-6 rounded-xl border border-gray-200/80 shadow-sm">
              <h3 className="font-bold text-sm text-gray-800 mb-4">Contributing Signals</h3>
              {(data.riskFactors || []).length === 0 ? (
                <p className="text-xs text-gray-400">No signals recorded for this check-in.</p>
              ) : (
                <div className="space-y-2 text-xs">
                  {data.riskFactors.map((f) => (
                    <div key={f.signal} className="flex items-center justify-between">
                      <span className="text-gray-600 font-medium capitalize">{f.signal.replace(/_/g, ' ')}</span>
                      <span className="font-bold text-gray-800">{f.value.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              )}
              {data.explanation && (
                <div className="mt-4 p-3 bg-blue-50 rounded-lg text-xs text-gray-700 leading-relaxed">
                  <span className="font-bold text-[#3D5A80] block mb-1">AI explanation</span>
                  {data.explanation}
                </div>
              )}
              {data.suggestedInterventionType && (
                <div className="mt-3 p-3 bg-blue-50 rounded-lg text-xs text-gray-700">
                  <span className="font-bold text-[#3D5A80]">AI-suggested intervention:</span> {data.suggestedInterventionType.name} - review before acting.
                </div>
              )}
            </div>

            {/* Case notes */}
            <div className="bg-white p-6 rounded-xl border border-gray-200/80 shadow-sm space-y-4">
              <h3 className="font-bold text-sm text-gray-800">Case Notes</h3>
              {notesQuery.loading ? (
                <p className="text-xs text-gray-400">Loading notes...</p>
              ) : (notesQuery.data?.notes || []).length === 0 ? (
                <p className="text-xs text-gray-400">No notes yet.</p>
              ) : (
                <div className="space-y-3 text-xs">
                  {notesQuery.data.notes.map((n) => (
                    <div key={n.noteId} className="border-b border-gray-50 pb-2">
                      <div className="flex items-center gap-2 text-gray-400 mb-1">
                        <span className="font-semibold text-gray-600">{n.authorName}</span>
                        {n.authoredBy === 'ai' && (
                          <span className="px-1.5 py-0.5 rounded bg-blue-50 text-[#3D5A80] text-[9px] font-bold uppercase">AI-drafted</span>
                        )}
                        <span>{new Date(n.createdAt).toLocaleString()}</span>
                      </div>
                      <p className="text-gray-700">{n.noteText}</p>
                    </div>
                  ))}
                </div>
              )}
              {!readOnly && (
                <div className="flex gap-2 pt-2">
                  <input
                    type="text"
                    value={noteText}
                    onChange={(e) => setNoteText(e.target.value)}
                    placeholder="Add a note..."
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-xs"
                  />
                  <button
                    onClick={handleAddNote}
                    disabled={addNote.loading}
                    className="px-4 py-2 bg-[#519BCE] text-white rounded-lg text-xs font-medium disabled:opacity-60"
                  >
                    Add
                  </button>
                </div>
              )}
            </div>

          </div>

          {/* RIGHT COLUMN */}
          <div className="space-y-6">
            <div className="bg-white p-6 rounded-xl border border-gray-200/80 shadow-sm">
              <h3 className="font-bold text-sm text-gray-800 mb-2">Case Background</h3>
              <p className="text-xs text-gray-600 leading-relaxed">{data.caseBackground || 'No background notes on file.'}</p>
            </div>

            {!readOnly && (
              <>
                {/* Scheduled Counsellings */}
                <div className="bg-white p-6 rounded-xl border border-gray-200/80 shadow-sm space-y-3">
                  <h3 className="font-bold text-sm text-gray-800 flex items-center gap-2"><CalendarPlus size={16} /> Schedule a Session</h3>
                  <input
                    type="datetime-local"
                    value={scheduleDate}
                    onChange={(e) => setScheduleDate(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs"
                  />
                  {scheduleStatus && <p className="text-[11px] text-gray-500">{scheduleStatus}</p>}
                  <button
                    onClick={handleSchedule}
                    disabled={scheduleSession.loading || !scheduleDate}
                    className="w-full px-3 py-2 bg-[#519BCE] hover:bg-[#3d83b3] text-white rounded-lg text-xs font-semibold transition disabled:opacity-60"
                  >
                    {scheduleSession.loading ? 'Scheduling...' : 'Schedule'}
                  </button>
                </div>

                {/* In-app chat - only shown when the victim has opted in to
                    a manual counsellor; hidden entirely (not disabled)
                    otherwise. */}
                {data.optedForManualCounsellor && (
                  <div className="bg-white rounded-xl border border-gray-200/80 shadow-sm overflow-hidden">
                    <button
                      onClick={() => setShowChat((v) => !v)}
                      className="w-full flex items-center justify-between px-6 py-4 text-left"
                    >
                      <h3 className="font-bold text-sm text-gray-800 flex items-center gap-2"><MessageCircle size={16} /> Chat with Victim</h3>
                      <span className="text-xs text-[#519BCE] font-semibold">{showChat ? 'Hide' : 'Open'}</span>
                    </button>
                    {showChat && <CaseChatPanel victimId={victimId} />}
                  </div>
                )}
              </>
            )}
          </div>

        </div>

      </div>
    </StaffLayout>
  );
}

function CaseChatPanel({ victimId }) {
  const { data, loading } = useCaseMessages(victimId);
  const sendMessage = useSendCaseMessage(victimId);
  const [draft, setDraft] = useState('');

  const handleSend = async () => {
    const text = draft.trim();
    if (!text) return;
    setDraft('');
    await sendMessage.mutate(text);
  };

  return (
    <div className="border-t border-gray-100 p-4 space-y-3">
      <div className="max-h-64 overflow-y-auto space-y-2">
        {loading ? (
          <p className="text-xs text-gray-400">Loading messages...</p>
        ) : (data?.messages || []).length === 0 ? (
          <p className="text-xs text-gray-400">No messages yet.</p>
        ) : data.messages.map((m) => (
          <div key={m.messageId} className={`flex ${m.senderType === 'official' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] px-3 py-2 rounded-lg text-xs ${m.senderType === 'official' ? 'bg-[#519BCE] text-white' : 'bg-gray-100 text-gray-800'}`}>
              {m.body}
            </div>
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          placeholder="Type a message..."
          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-xs"
        />
        <button
          onClick={handleSend}
          disabled={sendMessage.loading || !draft.trim()}
          className="px-4 py-2 bg-[#519BCE] hover:bg-[#3d83b3] text-white rounded-lg text-xs font-medium disabled:opacity-60"
        >
          Send
        </button>
      </div>
    </div>
  );
}
