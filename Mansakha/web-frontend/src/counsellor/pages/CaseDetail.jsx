import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import StaffLayout from '../layouts/StaffLayout';
import { ArrowUpRight, ArrowDownRight, Minus, MessageCircle, CalendarPlus, ChevronRight } from 'lucide-react';
import {
  useCaseDetail,
  useScheduleSession,
} from '../services/hooks';
import { useToast } from '../../shared/context/ToastContext';

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

// Counsellor's own copy - the full read/write Case File view (note-composing,
// intervention-logging, scheduling, in-app chat). Administration's copies of
// this page are separate, read-only files, per the PS's explicit
// Counsellor/Administration split.
export default function CaseDetail() {
  const { id: userId } = useParams();
  const navigate = useNavigate();
  const { data, loading, error } = useCaseDetail(userId);
  const scheduleSession = useScheduleSession(userId);
  const [scheduleDate, setScheduleDate] = useState('');
  const toast = useToast();

  const handleSchedule = async () => {
    if (!scheduleDate) return;
    try {
      await scheduleSession.mutate(new Date(scheduleDate).toISOString());
      toast.success('Session scheduled successfully.');
      setScheduleDate('');
    } catch (err) {
      toast.error(err.message || 'Could not schedule this session.');
    }
  };

  if (loading) {
    return <StaffLayout title="Case File"><p className="text-sm text-gray-400">Loading...</p></StaffLayout>;
  }
  if (error) {
    return <StaffLayout title="Case File"><div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm px-4 py-3 rounded-lg">{error}</div></StaffLayout>;
  }

  const trend = TREND_META[data.trend] || TREND_META.insufficient_data;
  const TrendIcon = trend.icon;

  return (
    <StaffLayout title={`Case File: ${userId.slice(0, 8)}`}>
      <div className="space-y-6">

        {/* TOP SUMMARY HEADER */}
        <div className="bg-white p-5 rounded-xl border border-gray-200/80 shadow-sm flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-10 flex-wrap">
            <div>
              <span className="text-[10px] font-bold tracking-wider text-gray-400 uppercase block">Case ID</span>
              <span className="text-base font-bold text-gray-800">{userId.slice(0, 8)}</span>
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

          <div className="flex items-center gap-3 flex-wrap justify-end">
            {data.optedForManualCounsellor && (
              <div className="relative inline-block">
                <button
                  onClick={() => navigate(`/counsellor/case-detail/${userId}/chat`)}
                  className="px-4 py-2 border border-[#519BCE] text-[#519BCE] rounded-lg text-xs font-medium hover:bg-blue-50 transition flex items-center gap-2"
                >
                  <MessageCircle size={14} /> Chat with User
                </button>
                {data.hasUnreadMessage && (
                  <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full"></span>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">

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

            {/* Case notes - own page (CaseNotes.jsx), not expanded inline
                here: a case can accumulate a long thread (every AI-drafted
                note per check-in included), which used to push the rest of
                the case file below the fold. */}
            <button
              onClick={() => navigate(`/counsellor/case-detail/${userId}/notes`)}
              className="w-full bg-white p-6 rounded-xl border border-gray-200/80 shadow-sm flex items-center justify-between hover:bg-gray-50 transition text-left"
            >
              <h3 className="font-bold text-sm text-gray-800">Case Notes</h3>
              <ChevronRight size={18} className="text-gray-400" />
            </button>

          </div>

          {/* RIGHT COLUMN */}
          <div className="space-y-6">
            <div className="bg-white p-6 rounded-xl border border-gray-200/80 shadow-sm">
              <h3 className="font-bold text-sm text-gray-800 mb-2">Case Background</h3>
              <p className="text-xs text-gray-600 leading-relaxed">{data.caseBackground || 'No background notes on file.'}</p>
            </div>

            {/* Scheduled Counsellings */}
            <div className="bg-white p-6 rounded-xl border border-gray-200/80 shadow-sm space-y-3">
              <h3 className="font-bold text-sm text-gray-800 flex items-center gap-2"><CalendarPlus size={16} /> Schedule a Session</h3>
              <input
                type="datetime-local"
                value={scheduleDate}
                onChange={(e) => setScheduleDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs"
              />
              <button
                onClick={handleSchedule}
                disabled={scheduleSession.loading || !scheduleDate}
                className="w-full px-3 py-2 bg-[#519BCE] hover:bg-[#3d83b3] text-white rounded-lg text-xs font-semibold transition disabled:opacity-60"
              >
                {scheduleSession.loading ? 'Scheduling...' : 'Schedule'}
              </button>
            </div>

          </div>

        </div>

      </div>
    </StaffLayout>
  );
}
