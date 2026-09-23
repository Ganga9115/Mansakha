import React, { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { usePageHeader } from '../../shared/context/PageHeaderContext';
import { ArrowUpRight, ArrowDownRight, Minus, MessageCircle, CalendarPlus, ChevronRight, ChevronDown, Repeat, Phone } from 'lucide-react';
import {
  useCaseDetail,
  useScheduleSession,
  useLinkedCases,
} from '../services/hooks';
import { useToast } from '../../shared/context/ToastContext';

const RISK_BADGE = {
  Critical: 'bg-red-100 text-red-800 border border-red-300',
  High: 'bg-orange-100 text-orange-800 border border-orange-300',
  Moderate: 'bg-amber-100 text-amber-700',
  Low: 'bg-emerald-100 text-emerald-800 border border-emerald-300',
};

const TREND_META = {
  escalating: { icon: ArrowUpRight, color: 'text-red-600', label: 'Escalating' },
  stable_or_improving: { icon: ArrowDownRight, color: 'text-emerald-600', label: 'Stable or improving' },
  insufficient_data: { icon: Minus, color: 'text-gray-400', label: 'Insufficient data' },
};

const RISK_DOT_COLOR = {
  Critical: '#b91c1c',
  High: '#ea580c',
  Moderate: '#f59e0b',
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
      <div className="flex gap-2">
        {/* Y-axis - score is always 0-100, so 3 fixed ticks (not computed
            off the data) are enough to read the line against. */}
        <div className="relative w-6 h-32 shrink-0 text-[8px] font-semibold text-gray-400">
          <span className="absolute right-0 -translate-y-1/2" style={{ top: '10%' }}>100</span>
          <span className="absolute right-0 -translate-y-1/2" style={{ top: '50%' }}>50</span>
          <span className="absolute right-0 -translate-y-1/2" style={{ top: '90%' }}>0</span>
        </div>
        <svg className="flex-1 min-w-0 h-32 overflow-visible" viewBox="0 0 500 100">
          <line x1="0" y1="50" x2="500" y2="50" stroke="#E5E7EB" strokeDasharray="4 4" />
          <path d={path} fill="none" stroke="#5b62c2" strokeWidth="2.5" />
          {points.map((p, i) => (
            <circle key={i} cx={p.x} cy={p.y} r="4" fill={RISK_DOT_COLOR[p.riskLevel] || '#9CA3AF'}>
              <title>{`${p.label} · ${p.source || 'Unknown source'}`}</title>
            </circle>
          ))}
        </svg>
      </div>
      <div
        className="grid text-[9px] font-semibold text-gray-400 px-1 pt-2 mt-2 border-t border-gray-100 ml-8"
        style={{ gridTemplateColumns: `repeat(${points.length}, minmax(0, 1fr))` }}
      >
        {points.map((p, i) => <span key={i} className="text-center whitespace-nowrap">{p.label}</span>)}
      </div>
    </div>
  );
}

// Multi-Case-Per-Person Support - a quick way to jump between a person's
// linked cases right from the title, so switching doesn't require scrolling
// down to the Linked Cases panel further down the page. Only rendered when
// there's actually more than one case (see otherLinkedCases below).
function SwitchCaseDropdown({ cases, onSelect }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 text-gray-600 rounded-lg text-xs font-medium hover:bg-gray-50 transition"
      >
        <Repeat size={13} /> Switch Case <ChevronDown size={13} />
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 w-64 bg-white border border-gray-200 rounded-lg shadow-lg z-50 overflow-hidden">
          <p className="text-[10px] font-bold text-gray-400 uppercase px-3 pt-2.5 pb-1">This person's other cases</p>
          {cases.map((c) => (
            <button
              key={c.userId}
              onClick={() => { setOpen(false); onSelect(c.userId); }}
              className="w-full text-left px-3 py-2 hover:bg-gray-50 transition border-t border-gray-50"
            >
              <p className="text-xs font-bold text-gray-800">Docket {c.docketNumber || '-'}</p>
              <p className="text-[10px] text-gray-500">{c.caseType || '-'} · {c.caseStage || '-'}</p>
            </button>
          ))}
        </div>
      )}
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
  const linkedCasesQuery = useLinkedCases(userId);
  const scheduleSession = useScheduleSession(userId);
  const [scheduleDate, setScheduleDate] = useState('');
  const toast = useToast();

  usePageHeader({ title: loading || error ? 'Case File' : `Case File: ${userId.slice(0, 8)}` });

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
    return <p className="text-sm text-gray-400">Loading...</p>;
  }
  if (error) {
    return <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm px-4 py-3 rounded-lg">{error}</div>;
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

  // Multi-Case-Per-Person Support - only worth showing once this person is
  // confirmed to have more than one case; a single-case person (the common
  // case) would otherwise see a section listing nothing but noise.
  const allLinkedCases = linkedCasesQuery.data?.cases || [];
  const otherLinkedCases = allLinkedCases.filter((c) => !c.isCurrent);

  // Solid navy (not outline) per explicit request - this is the page's
  // primary action, so it should read as such against the search bar it
  // now sits next to.
  const chatWithUserButton = (
    <div className="relative inline-block shrink-0">
      <button
        onClick={() => navigate(`/counsellor/case-detail/${userId}/chat`)}
        className="px-4 py-2.5 bg-brand-700 hover:bg-brand-800 text-white rounded-lg text-xs font-semibold transition flex items-center gap-2"
      >
        <MessageCircle size={14} /> Chat with User
      </button>
      {data.hasUnreadMessage && (
        <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full border border-white"></span>
      )}
    </div>
  );

  // Moved here from the Chat page's own header - same tel: action and same
  // "no phone on file" fallback, just placed next to this case's primary
  // action instead of only being reachable after already opening the thread.
  const callUserButton = (
    <button
      onClick={() => {
        if (data.phone) {
          window.location.href = `tel:${data.phone}`;
        } else {
          toast.error('No phone number on file for this user');
        }
      }}
      type="button"
      title={data.phone ? `Call ${data.userName || 'User'}` : 'No phone number on file'}
      className="px-4 py-2.5 border-2 border-[#7C5CBF] bg-[#F7F4FD] hover:bg-[#EDE8F7] active:bg-[#DDD0F5] text-[#7C5CBF] rounded-lg text-xs font-semibold transition flex items-center gap-2 shrink-0"
    >
      <Phone size={14} /> Call User
    </button>
  );

  return (
    <>
      <div className="space-y-6">

        {/* CASE ACTION BAR */}
        {(otherLinkedCases.length > 0 || chatWithUserButton) && (
          <div className="bg-white p-3 sm:p-4 rounded-xl border border-gray-200/80 shadow-sm flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div>
              {otherLinkedCases.length > 0 && (
                <SwitchCaseDropdown cases={otherLinkedCases} onSelect={(id) => navigate(`/counsellor/case-detail/${id}`)} />
              )}
            </div>
            <div className="self-end sm:self-auto flex items-center gap-2">
              {callUserButton}
              {chatWithUserButton}
            </div>
          </div>
        )}

        {/* TOP SUMMARY HEADER */}
        <div className="bg-white p-4 sm:p-5 rounded-xl border border-gray-200/80 shadow-sm grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-4 sm:gap-6">
          <div>
            <span className="text-[10px] font-bold tracking-wider text-gray-400 uppercase block">Case ID</span>
            <span className="text-sm sm:text-base font-bold text-gray-800 truncate block">{userId.slice(0, 8)}</span>
          </div>
          <div>
            <span className="text-[10px] font-bold tracking-wider text-gray-400 uppercase block">Case Stage</span>
            <span className="text-xs font-bold text-gray-700 block truncate">{data.caseStage || '-'}</span>
          </div>
          <div>
            <span className="text-[10px] font-bold tracking-wider text-gray-400 uppercase block mb-1">Risk Level</span>
            <span className={`inline-block text-xs font-bold px-2 py-0.5 rounded ${RISK_BADGE[data.riskLevel] || 'bg-gray-100 text-gray-600'}`}>
              {data.riskLevel}
            </span>
          </div>
          <div>
            <span className="text-[10px] font-bold tracking-wider text-gray-400 uppercase block">Distress Score</span>
            <span className="font-bold text-xs text-gray-800 block">{data.score}/100 {data.previousScore != null && <span className="text-gray-400 font-normal text-[11px]">(was {data.previousScore})</span>}</span>
          </div>
          <div>
            <span className="text-[10px] font-bold tracking-wider text-gray-400 uppercase block" title="Channel that produced the latest score">Source</span>
            <span className="text-xs font-bold text-gray-700 block truncate">{data.scoreSource || 'Unknown'}</span>
          </div>
          <div>
            <span className="text-[10px] font-bold tracking-wider text-gray-400 uppercase block">Trend</span>
            <span className={`flex items-center gap-1 text-xs font-bold mt-0.5 ${trend.color}`}>
              <TrendIcon size={14} className="shrink-0" /> <span className="truncate">{trend.label}</span>
            </span>
          </div>
          <div>
            <span className="text-[10px] font-bold tracking-wider text-gray-400 uppercase block" title="Forward-looking projection">Predicted Risk</span>
            <span className={`flex items-center gap-1 text-xs font-bold mt-0.5 ${predictedLabel.color}`}>
              <predictedLabel.Icon size={14} className="shrink-0" /> <span className="truncate">{predictedLabel.text}</span>
            </span>
          </div>
          <div>
            <span className="text-[10px] font-bold tracking-wider text-gray-400 uppercase block">Intervention</span>
            <span className="text-xs font-bold text-gray-700 block truncate">{data.interventionStatus}</span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* LEFT COLUMN */}
          <div className="lg:col-span-2 space-y-6">

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
                <div className="mt-4 p-3 bg-brand-50 rounded-lg text-xs text-gray-700 leading-relaxed">
                  <span className="font-bold text-brand-900 block mb-1">AI explanation</span>
                  {data.explanation}
                </div>
              )}
              {data.suggestedInterventionType && (
                <div className="mt-3 p-3 bg-brand-50 rounded-lg text-xs text-gray-700">
                  <span className="font-bold text-brand-900">AI-suggested intervention:</span> {data.suggestedInterventionType.name} - review before acting.
                </div>
              )}
            </div>

            {/* Distress score trend - see CaseTrendChart above for why this
                exists separately from the jurisdiction-wide Reports chart. */}
            <div className="bg-white p-6 rounded-xl border border-gray-200/80 shadow-sm">
              <h3 className="font-bold text-sm text-gray-800 mb-4">Distress Score Trend</h3>
              <CaseTrendChart history={data.scoreHistory || []} />
            </div>

          </div>

          {/* RIGHT COLUMN */}
          <div className="space-y-6">
            <div className="bg-white p-6 rounded-xl border border-gray-200/80 shadow-sm">
              <h3 className="font-bold text-sm text-gray-800 mb-2">Case Background</h3>
              <p className="text-xs text-gray-600 leading-relaxed">{data.caseBackground || 'No background notes on file.'}</p>
            </div>

            {/* Case Notes - own page (CaseNotes.jsx), not expanded inline
                here: a case can accumulate a long thread (every AI-drafted
                note per check-in included), which used to push the rest of
                the case file below the fold. Placed directly under Case
                Background per explicit request. */}
            <button
              onClick={() => navigate(`/counsellor/case-detail/${userId}/notes`)}
              className="w-full bg-white p-6 rounded-xl border border-gray-200/80 shadow-sm flex items-center justify-between hover:bg-gray-50 transition text-left"
            >
              <h3 className="font-bold text-sm text-gray-800">Case Notes</h3>
              <ChevronRight size={18} className="text-gray-400" />
            </button>

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
                className="w-full px-3 py-2 bg-brand-700 hover:bg-brand-800 text-white rounded-lg text-xs font-semibold transition disabled:opacity-60"
              >
                {scheduleSession.loading ? 'Scheduling...' : 'Schedule'}
              </button>
            </div>

          </div>

        </div>

      </div>
    </>
  );
}
