import React, { useState } from 'react';
import { X, Sparkles } from 'lucide-react';
import { useJurisdictionOptions, useGenerateAnalytics, useGenerateReport } from '../services/hooks';

// Ministry Analytics & Workflow Task 2E - upward-routing report builder,
// used as a MODAL from ReportsInbox.jsx (Ministry's console), not a route.
//
// "Which jurisdiction can this report be sent to" - GET /api/lookups/
// jurisdictions already answers this without any new endpoint/hook:
//   - level='district' rows each carry their own `parentId` (their state) -
//     see routes/lookups.js's `level === 'district'` branch - so a
//     district's own upward target is just its selected row's parentId.
//   - level='state' rows carry no parentId (every state's parent is the
//     SAME single national jurisdiction), so the target is just the one
//     level='national' row, fetched the exact same way
//     MinistryDashboard.jsx already derives its own "home" jurisdiction
//     (useJurisdictionOptions('national') -> [0].jurisdictionId).
//   - level='national' has nothing above it - no target, report is saved
//     without target_jurisdiction_id and stays 'Draft' per the backend's
//     own documented default.
// This needs no new backend lookup and no hooks.js edits (a sibling task's
// comment in MinistryDashboard.jsx notes hooks.js is being touched by other
// parallel tasks right now, so anything addable locally stays local).
const LEVELS = ['district', 'state', 'national'];

function AnalyticsSnapshotPanel({ jurisdictionId, insight, setInsight }) {
  const generateAnalytics = useGenerateAnalytics();
  const [errorMsg, setErrorMsg] = useState(null);

  const handleGenerate = async () => {
    setErrorMsg(null);
    try {
      const result = await generateAnalytics.mutate({ jurisdictionId });
      setInsight(result?.insight ?? null);
    } catch (err) {
      setErrorMsg(err.message || 'Could not generate analytics.');
    }
  };

  return (
    <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold text-gray-700 flex items-center gap-1.5"><Sparkles size={13} className="text-[#519BCE]" /> AI Snapshot</p>
          <p className="text-[11px] text-gray-400 mt-0.5">Optional - attaches a Gemini analytics read of this jurisdiction to the report.</p>
        </div>
        <button
          type="button"
          onClick={handleGenerate}
          disabled={generateAnalytics.loading || !jurisdictionId}
          className="px-3 py-1.5 bg-white border border-gray-300 hover:bg-gray-50 rounded-md text-[11px] font-semibold transition disabled:opacity-50 shrink-0"
        >
          {generateAnalytics.loading ? 'Generating...' : insight ? 'Regenerate' : 'Generate Snapshot'}
        </button>
      </div>
      {errorMsg && <p className="text-[11px] text-rose-600">{errorMsg}</p>}
      {generateAnalytics.loading && <p className="text-[11px] text-gray-400">Analyzing recent interaction data with Gemini...</p>}
      {!generateAnalytics.loading && insight === null && <p className="text-[11px] text-gray-400">Not enough interaction data yet for this period - report can still be submitted without a snapshot.</p>}
      {!generateAnalytics.loading && insight && (
        <div className="text-[11px] text-gray-600 space-y-1.5 border-t border-gray-200 pt-2">
          <p><span className="font-bold text-gray-700">Sentiment:</span> {insight.overallSentiment || '-'}</p>
          <p><span className="font-bold text-gray-700">Predicted demand:</span> <span className="capitalize">{(insight.predictedCounsellorDemand || '-').replace(/_/g, ' ')}</span></p>
          {Array.isArray(insight.topThemes) && insight.topThemes.length > 0 && (
            <p><span className="font-bold text-gray-700">Top themes:</span> {insight.topThemes.map((t) => t.theme).join(', ')}</p>
          )}
          {Array.isArray(insight.emergingRisks) && insight.emergingRisks.length > 0 && (
            <p className="text-red-700"><span className="font-bold">Emerging risks:</span> {insight.emergingRisks.join('; ')}</p>
          )}
        </div>
      )}
    </div>
  );
}

// `defaultJurisdictionId`/`defaultLevel` let a future caller that already
// has a jurisdiction in hand (e.g. an Admin's own dashboard) skip the
// picker - ReportsInbox.jsx (Ministry, jurisdiction-unrestricted) has no
// such fixed context, so it renders the full picker below.
export default function ReportBuilder({ onClose, onSubmitted, defaultJurisdictionId, defaultLevel }) {
  const [level, setLevel] = useState(defaultLevel || 'district');
  const [jurisdictionId, setJurisdictionId] = useState(defaultJurisdictionId || '');
  const [commentary, setCommentary] = useState('');
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [insight, setInsight] = useState(undefined); // undefined = not generated this session
  const [submitError, setSubmitError] = useState(null);

  const districtOptions = useJurisdictionOptions('district');
  const stateOptions = useJurisdictionOptions('state');
  const nationalOptions = useJurisdictionOptions('national');
  const generateReport = useGenerateReport();

  const optionsByLevel = {
    district: districtOptions.data?.jurisdictions || [],
    state: stateOptions.data?.jurisdictions || [],
    national: nationalOptions.data?.jurisdictions || [],
  };
  const currentOptions = optionsByLevel[level];
  const selectedJurisdiction = currentOptions.find((j) => j.jurisdictionId === jurisdictionId);

  // Derived upward target - see the file-level comment for the reasoning.
  let targetJurisdictionId = null;
  let targetLabel = 'None - top of hierarchy, saved as a Draft only';
  if (level === 'district' && selectedJurisdiction?.parentId) {
    targetJurisdictionId = selectedJurisdiction.parentId;
    const stateName = optionsByLevel.state.find((s) => s.jurisdictionId === targetJurisdictionId)?.name;
    targetLabel = stateName || 'Parent state';
  } else if (level === 'state') {
    const national = optionsByLevel.national[0];
    if (national) {
      targetJurisdictionId = national.jurisdictionId;
      targetLabel = national.name;
    }
  }

  const handleLevelChange = (newLevel) => {
    setLevel(newLevel);
    setJurisdictionId('');
    setInsight(undefined);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!jurisdictionId) return;
    setSubmitError(null);
    try {
      await generateReport.mutate({
        jurisdictionId,
        periodStart: periodStart ? new Date(periodStart).toISOString() : undefined,
        periodEnd: periodEnd ? new Date(periodEnd).toISOString() : undefined,
        commentary: commentary.trim() || undefined,
        targetJurisdictionId: targetJurisdictionId || undefined,
        insightId: insight?.insightId || undefined,
      });
      onSubmitted?.();
      onClose?.();
    } catch (err) {
      setSubmitError(err.message || 'Could not generate report.');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white">
          <h3 className="font-bold text-sm text-gray-800">New Report</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[11px] font-bold text-gray-500 uppercase block mb-1">Jurisdiction Level</label>
              <select
                value={level}
                onChange={(e) => handleLevelChange(e.target.value)}
                disabled={!!defaultJurisdictionId}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white disabled:bg-gray-100"
              >
                {LEVELS.map((l) => <option key={l} value={l} className="capitalize">{l}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[11px] font-bold text-gray-500 uppercase block mb-1">Jurisdiction</label>
              <select
                value={jurisdictionId}
                onChange={(e) => { setJurisdictionId(e.target.value); setInsight(undefined); }}
                disabled={!!defaultJurisdictionId}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white disabled:bg-gray-100"
              >
                <option value="">Select...</option>
                {currentOptions.map((j) => <option key={j.jurisdictionId} value={j.jurisdictionId}>{j.name}</option>)}
              </select>
            </div>
          </div>

          <div className="bg-[#EBF4FA]/60 border border-[#D6E8F5] rounded-lg px-4 py-2.5 text-[11px] text-[#3D5A80]">
            <span className="font-bold">Sends to:</span> {jurisdictionId ? targetLabel : 'Select a jurisdiction first'}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[11px] font-bold text-gray-500 uppercase block mb-1">Period Start (optional)</label>
              <input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
            </div>
            <div>
              <label className="text-[11px] font-bold text-gray-500 uppercase block mb-1">Period End (optional)</label>
              <input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
            </div>
          </div>
          <p className="text-[10px] text-gray-400 -mt-3">Leave blank to default to the last 30 days.</p>

          <AnalyticsSnapshotPanel jurisdictionId={jurisdictionId} insight={insight} setInsight={setInsight} />

          <div>
            <label className="text-[11px] font-bold text-gray-500 uppercase block mb-1">Commentary &amp; Recommendations</label>
            <textarea
              value={commentary}
              onChange={(e) => setCommentary(e.target.value)}
              rows={4}
              placeholder="Notes for the receiving tier - context, concerns, recommended actions..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
          </div>

          {submitError && <p className="text-xs text-rose-600">{submitError}</p>}

          <div className="flex items-center justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 border border-gray-300 text-gray-600 hover:bg-gray-50 rounded-lg text-xs font-semibold transition">
              Cancel
            </button>
            <button
              type="submit"
              disabled={generateReport.loading || !jurisdictionId}
              className="px-4 py-2.5 bg-[#519BCE] hover:bg-[#3d83b3] text-white rounded-lg text-sm font-semibold transition disabled:opacity-60"
            >
              {generateReport.loading ? 'Submitting...' : targetJurisdictionId ? `Submit to ${targetLabel}` : 'Save as Draft'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
