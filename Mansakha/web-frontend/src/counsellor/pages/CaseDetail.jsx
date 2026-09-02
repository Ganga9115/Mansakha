import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import StaffLayout from '../layouts/StaffLayout';
import { ArrowUpRight, ArrowDownRight, Minus, MessageCircle, CalendarPlus, ChevronRight } from 'lucide-react';
import {
  useCaseDetail,
  useScheduleSession,
  useInterventionTypes,
  useLogIntervention,
  useCompleteIntervention,
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

const RISK_DOT_COLOR = {
  Critical: '#7e22ce',
  High: '#dc2626',
  Moderate: '#d97706',
  Low: '#059669',
};

// This case's own score readings over time (Section 2.2/FR-3.3 "weekly
// distress score to help counsellors analyse trends") - distinct from the
// Reports page's trend chart, which only ever averages scores across the
// whole jurisdiction and can't show one case's history. Small hand-rolled
// SVG line (matching Reports.jsx's TrendChart pattern) rather than a
// charting library, since this is the only chart this page needs.
function CaseTrendChart({ history }) {
  if (history.length < 2) {
    return <p className="text-xs text-gray-400">Not enough check-ins yet to chart a trend - one more reading will unlock this.</p>;
  }

  const points = history.map((h, i) => ({
    x: (i / (history.length - 1)) * 500,
    y: 90 - (Math.max(0, Math.min(100, h.score)) / 100) * 80,
    riskLevel: h.riskLevel,
    source: h.source,
    label: new Date(h.computedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
  }));
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');

  return (
    <div className="pt-1">
      <svg className="w-full h-32 overflow-visible" viewBox="0 0 500 100">
        <line x1="0" y1="50" x2="500" y2="50" stroke="#E5E7EB" strokeDasharray="4 4" />
        <path d={path} fill="none" stroke="#519BCE" strokeWidth="2.5" />
        {points.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r="4" fill={RISK_DOT_COLOR[p.riskLevel] || '#9CA3AF'}>
            <title>{`${p.label} · ${p.source || 'Unknown source'}`}</title>
          </circle>
        ))}
      </svg>
      <div
        className="grid text-[9px] font-semibold text-gray-400 px-1 pt-2 mt-2 border-t border-gray-100"
        style={{ gridTemplateColumns: `repeat(${points.length}, minmax(0, 1fr))` }}
      >
        {points.map((p, i) => <span key={i} className="text-center whitespace-nowrap">{p.label}</span>)}
      </div>
    </div>
  );
}

// Counsellor's own copy - the full read/write Case File view (note-composing,
// intervention-logging, scheduling, in-app chat). Administration's copies of
// this page are separate, read-only files, per the PS's explicit
// Counsellor/Administration split.
export default function CaseDetail() {
  const { id: userId } = useParams();
  const navigate = useNavigate();
  const { data, loading, error, refetch } = useCaseDetail(userId);
  const scheduleSession = useScheduleSession(userId);
  const [scheduleDate, setScheduleDate] = useState('');
  const toast = useToast();

  const interventionTypesQuery = useInterventionTypes();
  const logIntervention = useLogIntervention(userId);
  const completeIntervention = useCompleteIntervention(userId);
  const [interventionTypeId, setInterventionTypeId] = useState('');
  const [interventionNotes, setInterventionNotes] = useState('');

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

  const handleLogIntervention = async () => {
    if (!interventionTypeId) return;
    try {
      await logIntervention.mutate({ interventionTypeId, notes: interventionNotes.trim() || undefined });
      toast.success('Intervention logged.');
      setInterventionTypeId('');
      setInterventionNotes('');
      refetch();
    } catch (err) {
      toast.error(err.message || 'Could not log this intervention.');
    }
  };

  const handleCompleteIntervention = async () => {
    if (!data?.interventionId) return;
    try {
      await completeIntervention.mutate(data.interventionId);
      toast.success('Intervention marked complete.');
      refetch();
    } catch (err) {
      toast.error(err.message || 'Could not update this intervention.');
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

  // Forward-looking, distinct from `trend` above: `trend` says whether this
  // case has ALREADY been rising; this is a projection of where it's headed
  // (PS: "predict escalation... before a crisis situation emerges").
  const predicted = data.predictedRisk;
  const predictedLabel = !predicted || predicted.predictedTrend === 'insufficient_data'
    ? { text: 'Not enough data', color: 'text-gray-400', Icon: Minus }
    : predicted.daysToNextTier != null
      ? { text: `${predicted.nextTier} in ~${predicted.daysToNextTier}d`, color: 'text-orange-600', Icon: ArrowUpRight }
      : predicted.predictedTrend === 'rising'
        ? { text: 'Rising (no crossing soon)', color: 'text-amber-600', Icon: ArrowUpRight }
        : predicted.predictedTrend === 'falling'
          ? { text: 'Improving', color: 'text-emerald-600', Icon: ArrowDownRight }
          : { text: 'Stable', color: 'text-gray-500', Icon: Minus };

  // Moved into the header (StaffLayout's headerAction) rather than sitting
  // alone in its own row inside the page content, where it left a lot of
  // empty space next to it - the header is where a page's primary action
  // belongs, same as profile/notifications/logout already do.
  const chatWithUserButton = data.optedForManualCounsellor ? (
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
  ) : null;

  return (
    <StaffLayout title={`Case File: ${userId.slice(0, 8)}`} headerAction={chatWithUserButton}>
      <div className="space-y-6">

        {/* TOP SUMMARY HEADER */}
        <div className="bg-white p-5 rounded-xl border border-gray-200/80 shadow-sm flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-10 flex-wrap">
            <div>
              <span className="text-[10px] font-bold tracking-wider text-gray-400 uppercase block">Case ID</span>
              <span className="text-base font-bold text-gray-800">{userId.slice(0, 8)}</span>
            </div>
            <div>
              <span className="text-[10px] font-bold tracking-wider text-gray-400 uppercase block">Case Stage</span>
              <span className="text-xs font-bold text-gray-700">{data.caseStage || '-'}</span>
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
              <span className="text-[10px] font-bold tracking-wider text-gray-400 uppercase block" title="Which channel produced the latest score - hover a dot on the trend chart below for older readings.">Source</span>
              <span className="text-xs font-bold text-gray-700">{data.scoreSource || 'Unknown'}</span>
            </div>
            <div>
              <span className="text-[10px] font-bold tracking-wider text-gray-400 uppercase block">Trend</span>
              <span className={`flex items-center gap-1 text-xs font-bold mt-0.5 ${trend.color}`}>
                <TrendIcon size={14} /> {trend.label}
              </span>
            </div>
            <div>
              <span className="text-[10px] font-bold tracking-wider text-gray-400 uppercase block" title="Forward-looking projection from this case's score history - distinct from Trend, which only looks backward.">Predicted Risk</span>
              <span className={`flex items-center gap-1 text-xs font-bold mt-0.5 ${predictedLabel.color}`}>
                <predictedLabel.Icon size={14} /> {predictedLabel.text}
              </span>
            </div>
            <div>
              <span className="text-[10px] font-bold tracking-wider text-gray-400 uppercase block">Intervention</span>
              <span className="text-xs font-bold text-gray-700">{data.interventionStatus}</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">

          {/* LEFT COLUMN */}
          <div className="col-span-2 space-y-6">

            {/* Contributing signals */}
            <div className="bg-white p-6 rounded-xl border border-gray-200/80 shadow-sm">
              <h3 className="font-bold text-sm text-gray-800 mb-4">Contributing Signals</h3>
              {(data.riskFactors || []).length === 0 ? (
                // Not an error state - AI Chat, IVRS, and Weekly Review scores
                // (all Ollama-based) produce one holistic score + summary, not
                // the 4 separate sentiment/voice-stress/emotion/engagement
                // sub-scores only a Gemini-analyzed reading breaks out. The
                // previous "No signals recorded" wording read like something
                // had gone wrong, when this is simply how that channel scores.
                <p className="text-xs text-gray-400">Detailed signal breakdown isn't available for this channel.</p>
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

            {/* Distress score trend - see CaseTrendChart above for why this
                exists separately from the jurisdiction-wide Reports chart. */}
            <div className="bg-white p-6 rounded-xl border border-gray-200/80 shadow-sm">
              <h3 className="font-bold text-sm text-gray-800 mb-4">Distress Score Trend</h3>
              <CaseTrendChart history={data.scoreHistory || []} />
            </div>

            {/* Log Intervention - the only thing that (a) ever populates the
                Reports page's "Intervention Phase Breakdown" donut and (b)
                acknowledges this case's open alert (see the backend route -
                an alert only ever leaves "Open" once an intervention is
                logged against it). Neither had a UI entry point before this. */}
            <div className="bg-white p-6 rounded-xl border border-gray-200/80 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-sm text-gray-800">Intervention</h3>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wide bg-gray-100 text-gray-600">
                  {data.interventionStatus === 'none' ? 'None logged' : data.interventionStatus}
                </span>
              </div>

              {data.interventionStatus === 'pending' ? (
                <button
                  onClick={handleCompleteIntervention}
                  disabled={completeIntervention.loading}
                  className="w-full px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold transition disabled:opacity-60"
                >
                  {completeIntervention.loading ? 'Updating...' : 'Mark Intervention Complete'}
                </button>
              ) : (
                <>
                  <select
                    value={interventionTypeId}
                    onChange={(e) => setInterventionTypeId(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs"
                  >
                    <option value="">Select an intervention type...</option>
                    {(interventionTypesQuery.data?.interventionTypes || []).map((t) => (
                      <option key={t.intervention_type_id} value={t.intervention_type_id}>{t.name}</option>
                    ))}
                  </select>
                  <textarea
                    value={interventionNotes}
                    onChange={(e) => setInterventionNotes(e.target.value)}
                    placeholder="Notes for this intervention (optional)"
                    rows={2}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs resize-none"
                  />
                  <button
                    onClick={handleLogIntervention}
                    disabled={logIntervention.loading || !interventionTypeId}
                    className="w-full px-3 py-2 bg-[#519BCE] hover:bg-[#3d83b3] text-white rounded-lg text-xs font-semibold transition disabled:opacity-60"
                  >
                    {logIntervention.loading ? 'Logging...' : 'Log Intervention'}
                  </button>
                </>
              )}
            </div>

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

            {/* Case Notes - own page (CaseNotes.jsx), not expanded inline
                here: a case can accumulate a long thread (every AI-drafted
                note per check-in included), which used to push the rest of
                the case file below the fold. Moved here under Schedule a
                Session per explicit request, rather than duplicating it in
                the left column too. */}
            <button
              onClick={() => navigate(`/counsellor/case-detail/${userId}/notes`)}
              className="w-full bg-white p-6 rounded-xl border border-gray-200/80 shadow-sm flex items-center justify-between hover:bg-gray-50 transition text-left"
            >
              <h3 className="font-bold text-sm text-gray-800">Case Notes</h3>
              <ChevronRight size={18} className="text-gray-400" />
            </button>

          </div>

        </div>

      </div>
    </StaffLayout>
  );
}
