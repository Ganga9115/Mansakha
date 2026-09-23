import React, { useEffect, useState } from 'react';
import { usePageHeader } from '../../shared/context/PageHeaderContext';
import { useJurisdictionOptions, useAdminDashboard, useHeatmap } from '../services/hooks';
import { apiClient } from '../services/apiClient';
import { getToken } from '../services/auth';

function StatCard({ title, value, tone }) {
  return (
    <div className="bg-white p-5 rounded-xl border border-gray-200/80 shadow-sm space-y-1">
      <span className="text-[10px] font-bold tracking-wider text-gray-400 uppercase block">{title}</span>
      <span className={`text-2xl font-bold block ${tone || 'text-gray-800'}`}>{value}</span>
    </div>
  );
}

// Color intensity by average distress score (the primary metric); user
// count shown as secondary text on each card. A grid of cards, not a real
// map - no mapping library is a dependency here, and one card per state/UT
// says everything a choropleth would for this data's granularity. Moved
// here from the retired standalone Analysis/Heatmap page - this is the
// single most important piece of it ("which states need attention right
// now"), so it lives on the Dashboard itself instead of behind its own nav
// item; the fuller bar-chart/donut breakdown moved to National Admin's own
// Analysis page instead (see that page's own header comment).
function intensityClass(avgScore) {
  if (avgScore == null) return 'bg-gray-50 border-gray-200 text-gray-400';
  if (avgScore >= 80) return 'bg-purple-600 border-purple-700 text-white';
  if (avgScore >= 60) return 'bg-rose-500 border-rose-600 text-white';
  if (avgScore >= 40) return 'bg-amber-400 border-amber-500 text-gray-900';
  return 'bg-emerald-400 border-emerald-500 text-gray-900';
}

function CriticalHeatmap() {
  const { data, loading, error } = useHeatmap();
  const [showAll, setShowAll] = useState(false);
  const regions = data?.heatmap || [];
  const sortedRegions = [...regions].sort((a, b) => (b.averageScore || 0) - (a.averageScore || 0));
  const displayedRegions = showAll ? sortedRegions : sortedRegions.slice(0, 6);

  return (
    <div>
      <div className="flex justify-between items-end mb-4">
        <div>
          <h3 className="font-bold text-sm text-gray-800">Critical Heatmap</h3>
          <p className="text-[11px] text-gray-400 mt-1">
            {loading ? 'Loading...' : `Showing ${showAll ? 'all states' : 'top 6 worst-affected states'}, by average distress score.`}
          </p>
        </div>
        {regions.length > 6 && (
          <button onClick={() => setShowAll(!showAll)} className="text-xs font-semibold text-rose-600 hover:text-rose-700 shrink-0">
            {showAll ? 'Show less' : 'See all states →'}
          </button>
        )}
      </div>
      {loading ? null : error ? (
        <p className="text-xs text-rose-600">{error}</p>
      ) : regions.length === 0 ? (
        <p className="text-xs text-gray-400">No regional data yet.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {displayedRegions.map((r) => (
            <div key={r.jurisdictionId} className={`p-4 rounded-xl border ${intensityClass(r.averageScore)}`}>
              <p className="font-bold text-sm">{r.name}</p>
              <p className="text-2xl font-bold mt-2">{r.averageScore != null ? r.averageScore.toFixed(0) : '-'}</p>
              <p className="text-[11px] opacity-80 mt-1">avg. distress score</p>
              <p className="text-[11px] opacity-80">{r.userCount} users</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Ministry Analytics & Workflow Task 4A - GET /api/admin/national/dashboard/:id/trend.
// Kept local to this file, mirroring hooks.js's own useQuery pattern, since
// it's the only page that needs it.
function useJurisdictionTrend(jurisdictionId, months = 6) {
  const token = getToken();
  const [state, setState] = useState({ data: null, loading: true, error: null });

  useEffect(() => {
    if (!jurisdictionId) {
      setState({ data: null, loading: false, error: null });
      return undefined;
    }
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));
    apiClient
      .get(`/api/admin/national/dashboard/${jurisdictionId}/trend?months=${months}`, token)
      .then((data) => { if (!cancelled) setState({ data, loading: false, error: null }); })
      .catch((err) => { if (!cancelled) setState({ data: null, loading: false, error: err.message }); });
    return () => { cancelled = true; };
  }, [jurisdictionId, months, token]);

  return state;
}

// Ministry Analytics & Workflow Task 4A - a longitudinal distress-score
// trend line, plotted from .../trend. Used to also overlay "policy launch"
// markers on this same chart (Deploy New Policy) - that feature (and
// Emergency Broadcast) was retired as not appropriate for this system's
// real scope, so this is now just the score trend it always genuinely
// computed.
function TrendChart({ jurisdictionId }) {
  const { data, loading, error } = useJurisdictionTrend(jurisdictionId);
  const points = data?.points || [];
  const hasScores = points.some((p) => p.averageScore != null);

  const width = 500;
  const height = 100;
  const n = points.length;
  const xForIndex = (i) => (n <= 1 ? width / 2 : (i / (n - 1)) * width);
  const yForScore = (score) => height - (Math.min(100, Math.max(0, score)) / 100) * height;

  const pathD = points.reduce((acc, p, i) => {
    if (p.averageScore == null) return acc;
    const seg = `${xForIndex(i)} ${yForScore(p.averageScore)}`;
    return acc ? `${acc} L ${seg}` : `M ${seg}`;
  }, '');

  return (
    <div className="bg-white p-6 rounded-xl border border-gray-200/80 shadow-sm">
      <h3 className="font-bold text-sm text-gray-800 mb-1">Distress Trend (National)</h3>
      <p className="text-[11px] text-gray-400 mb-4">Average distress score by month.</p>
      {loading ? (
        <p className="text-xs text-gray-400">Loading...</p>
      ) : error ? (
        <p className="text-xs text-rose-600">{error}</p>
      ) : !hasScores ? (
        <p className="text-xs text-gray-400">Not enough data yet.</p>
      ) : (
        <div className="space-y-1">
          <div className="flex gap-2">
            {/* Y-axis - score is always 0-100, so 3 fixed ticks (not
                computed off the data) are enough to read the line against. */}
            <div className="relative w-6 h-32 shrink-0 text-[8px] font-semibold text-gray-400">
              <span className="absolute right-0 -translate-y-1/2 top-0">100</span>
              <span className="absolute right-0 -translate-y-1/2 top-1/2">50</span>
              <span className="absolute right-0 -translate-y-1/2 bottom-0 top-auto">0</span>
            </div>
            <div className="flex-1 min-w-0 h-32 relative">
              <svg className="w-full h-full overflow-visible" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
                <line x1="0" y1={height / 2} x2={width} y2={height / 2} stroke="#c0c2e8" strokeDasharray="4 4" />
                <path d={pathD} fill="none" stroke="#5b62c2" strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
                {points.map((p, i) =>
                  p.averageScore == null ? null : (
                    <circle key={p.month} cx={xForIndex(i)} cy={yForScore(p.averageScore)} r="2.5" fill="#1e224f" />
                  )
                )}
              </svg>
            </div>
          </div>
          <div className="flex justify-between text-[10px] font-semibold text-gray-400 pt-2 border-t border-gray-100 ml-8">
            {points.map((p) => (
              <span key={p.month}>{p.month.slice(5)}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Ministry's own landing dashboard - a superset of National Admin's view (no
// jurisdiction restriction applies to Ministry per the Build Prompt), so it
// fetches the root national jurisdiction and reuses the same tier-
// differentiated dashboard endpoint National Admin's own dashboard calls.
export default function MinistryDashboard() {
  usePageHeader({ title: 'Ministry Dashboard' });
  const nationalJurisdictionQuery = useJurisdictionOptions('national');
  const nationalJurisdictionId = nationalJurisdictionQuery.data?.jurisdictions?.[0]?.jurisdictionId;
  const { data, loading, error } = useAdminDashboard(nationalJurisdictionId);

  const states = data?.trends || [];

  return (
    <>
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          <StatCard title="Total Cases (Nationwide)" value={data?.total ?? '-'} />
          <StatCard title="High-Risk Cases" value={data?.highRisk ?? '-'} tone="text-rose-600" />
          <StatCard title="Critical Cases" value={data?.critical ?? '-'} tone="text-purple-700" />
        </div>

        <CriticalHeatmap />

        {/* Coordination-role at-a-glance counts - see district_admin's own
            AdminDashboard.jsx for the full rationale comment. Ministry rides
            National's own dashboard route (useAdminDashboard above), so
            these two fields are already present on the same `data` object. */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 lg:w-2/3">
          <StatCard title="Open Protection Referrals (Nationwide)" value={data?.openProtectionReferrals ?? '-'} tone="text-rose-600" />
          <StatCard title="Compensation Pending (Nationwide)" value={data?.compensationPendingCount ?? '-'} tone="text-amber-600" />
        </div>

        <div className="bg-white rounded-xl border border-gray-200/80 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h3 className="font-bold text-sm text-gray-800">State/UT-wise Breakdown</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-brand-50/60 text-gray-600 text-[11px] uppercase tracking-wider font-semibold border-b border-gray-100">
                  <th className="py-3 px-6">State / UT</th>
                  <th className="py-3 px-4">Total Cases</th>
                  <th className="py-3 px-4">High-Risk</th>
                  <th className="py-3 px-4">Critical</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-xs">
                {nationalJurisdictionQuery.loading || loading ? (
                  <tr><td colSpan={4} className="py-8 text-center text-gray-400">Loading...</td></tr>
                ) : error ? (
                  <tr><td colSpan={4} className="py-8 text-center text-rose-600">{error}</td></tr>
                ) : states.length === 0 ? (
                  <tr><td colSpan={4} className="py-8 text-center text-gray-400">No state data yet.</td></tr>
                ) : states.map((s) => (
                  <tr key={s.jurisdictionId} className="hover:bg-gray-50/70 transition">
                    <td className="py-3.5 px-6 font-bold text-gray-800">{s.name}</td>
                    <td className="py-3.5 px-4 text-gray-700 font-medium">{s.total}</td>
                    <td className="py-3.5 px-4 text-rose-600 font-bold">{s.highRisk}</td>
                    <td className="py-3.5 px-4 text-purple-700 font-bold">{s.critical}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <TrendChart jurisdictionId={nationalJurisdictionId} />
      </div>
    </>
  );
}
