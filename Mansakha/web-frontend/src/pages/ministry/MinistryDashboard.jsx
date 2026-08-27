import React, { useEffect, useState } from 'react';
import MinistryLayout from '../../layouts/MinistryLayout';
import { useJurisdictionOptions, useAdminDashboard, useCreatePolicy } from '../../services/hooks';
import { apiClient } from '../../services/apiClient';
import { getToken } from '../../services/auth';

function StatCard({ title, value, tone }) {
  return (
    <div className="bg-white p-5 rounded-xl border border-gray-200/80 shadow-sm space-y-1">
      <span className="text-[10px] font-bold tracking-wider text-gray-400 uppercase block">{title}</span>
      <span className={`text-2xl font-bold block ${tone || 'text-gray-800'}`}>{value}</span>
    </div>
  );
}

// Ministry Analytics & Workflow Task 4A - GET /api/admin/dashboard/:jurisdictionId/trend.
// No hook for this endpoint exists yet in services/hooks.js (only the
// older, unrelated `data.trend` embedded in useAdminDashboard's response,
// which National/State/AdminDashboard already render elsewhere as simple
// bars - a different, coarser shape with no policy overlay). Kept local to
// this file, mirroring hooks.js's own useQuery pattern, rather than editing
// hooks.js while other tasks are touching it in parallel.
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
      .get(`/api/admin/dashboard/${jurisdictionId}/trend?months=${months}`, token)
      .then((data) => { if (!cancelled) setState({ data, loading: false, error: null }); })
      .catch((err) => { if (!cancelled) setState({ data: null, loading: false, error: err.message }); });
    return () => { cancelled = true; };
  }, [jurisdictionId, months, token]);

  return state;
}

// Task 4A "Trend Line policy markers" - GET .../trend now also returns
// `policies: [{policyId, title, launchedAt}]` (launched within the same
// [windowStart, now] window as `points`), so each policy is overlaid as a
// vertical marker on the SAME month x-axis the score line already uses.
// This page had no chart of any kind before this task, so the visual
// approach (a plain inline SVG line, no charting library in package.json)
// is matched from the one other real SVG line chart in this codebase
// (pages/staff/shared/Reports.jsx's "Average Distress Severity Trends").
function TrendChart({ jurisdictionId }) {
  const { data, loading, error } = useJurisdictionTrend(jurisdictionId);
  const points = data?.points || [];
  const policies = data?.policies || [];
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

  // Each policy's launchedAt month matched against the point whose `month`
  // ('YYYY-MM') it falls in, so its marker lines up with that month's tick
  // on the same x-axis the score line uses.
  const policyMarkers = policies
    .map((p) => {
      const monthKey = (p.launchedAt || '').slice(0, 7);
      const idx = points.findIndex((pt) => pt.month === monthKey);
      return idx >= 0 ? { ...p, x: xForIndex(idx) } : null;
    })
    .filter(Boolean);

  return (
    <div className="bg-white p-6 rounded-xl border border-gray-200/80 shadow-sm">
      <h3 className="font-bold text-sm text-gray-800 mb-1">Distress Trend (National)</h3>
      <p className="text-[11px] text-gray-400 mb-4">Average distress score by month. Dashed amber markers are launched policies - hover for details.</p>
      {loading ? (
        <p className="text-xs text-gray-400">Loading...</p>
      ) : error ? (
        <p className="text-xs text-rose-600">{error}</p>
      ) : !hasScores ? (
        <p className="text-xs text-gray-400">Not enough data yet.</p>
      ) : (
        <div className="space-y-1">
          <div className="h-32 relative">
            <svg className="w-full h-full overflow-visible" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
              <line x1="0" y1={height / 2} x2={width} y2={height / 2} stroke="#E5E7EB" strokeDasharray="4 4" />
              {policyMarkers.map((p) => (
                <line
                  key={p.policyId}
                  x1={p.x}
                  y1="0"
                  x2={p.x}
                  y2={height}
                  stroke="#D97706"
                  strokeWidth="1.5"
                  strokeDasharray="3 2"
                  vectorEffect="non-scaling-stroke"
                >
                  <title>{`${p.title} — launched ${new Date(p.launchedAt).toLocaleDateString()}`}</title>
                </line>
              ))}
              <path d={pathD} fill="none" stroke="#519BCE" strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
              {points.map((p, i) =>
                p.averageScore == null ? null : (
                  <circle key={p.month} cx={xForIndex(i)} cy={yForScore(p.averageScore)} r="2.5" fill="#3D5A80" />
                )
              )}
            </svg>
          </div>
          <div className="flex justify-between text-[10px] font-semibold text-gray-400 pt-2 border-t border-gray-100">
            {points.map((p) => (
              <span key={p.month}>{p.month.slice(5)}</span>
            ))}
          </div>
          {policyMarkers.length > 0 && (
            <div className="relative h-4">
              {policyMarkers.map((p) => (
                <span
                  key={p.policyId}
                  title={`${p.title} — launched ${new Date(p.launchedAt).toLocaleDateString()}`}
                  className="absolute -translate-x-1/2 text-amber-600 text-[10px] font-bold cursor-help select-none"
                  style={{ left: `${(p.x / width) * 100}%` }}
                >
                  ▲
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DeployPolicyWidget({ jurisdictionId, onDeployed }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [launchedAt, setLaunchedAt] = useState('');
  const [errorMsg, setErrorMsg] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);
  
  const createPolicy = useCreatePolicy();

  const handleDeploy = async (e) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);
    if (!title || !launchedAt) {
      setErrorMsg('Title and Launch Date are required.');
      return;
    }

    try {
      await createPolicy.mutate({
        jurisdictionId,
        title,
        description,
        launchedAt,
      });
      setSuccessMsg('Policy deployed successfully!');
      setTitle('');
      setDescription('');
      setLaunchedAt('');
      if (onDeployed) onDeployed();
    } catch (err) {
      setErrorMsg(err.message || 'Could not deploy policy.');
    }
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200/80 shadow-sm p-6 space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="font-bold text-sm text-gray-800">Deploy New Policy</h3>
          <p className="text-[11px] text-gray-400 mt-0.5">
            Log strategic interventions to measure their impact against the distress trend line.
          </p>
        </div>
      </div>
      
      <form onSubmit={handleDeploy} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-[11px] font-bold text-gray-600 uppercase mb-1">Policy Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full text-xs p-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20"
              placeholder="e.g. Operation Safe Streets"
            />
          </div>
          <div>
            <label className="block text-[11px] font-bold text-gray-600 uppercase mb-1">Launch Date</label>
            <input
              type="date"
              value={launchedAt}
              onChange={(e) => setLaunchedAt(e.target.value)}
              className="w-full text-xs p-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
        </div>
        <div>
          <label className="block text-[11px] font-bold text-gray-600 uppercase mb-1">Description (Optional)</label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full text-xs p-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20"
            placeholder="Brief details about the policy..."
          />
        </div>
        
        {errorMsg && <p className="text-xs text-rose-600">{errorMsg}</p>}
        {successMsg && <p className="text-xs text-emerald-600">{successMsg}</p>}

        <div className="flex justify-end mt-2">
          <button
            type="submit"
            disabled={createPolicy.loading || !jurisdictionId}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-sm transition disabled:opacity-60"
          >
            {createPolicy.loading ? 'Deploying...' : 'Deploy Policy'}
          </button>
        </div>
      </form>
    </div>
  );
}

// Ministry's own landing dashboard - a superset of National Admin's view
// (no jurisdiction restriction applies to Ministry per the Build Prompt),
// so it fetches the root national jurisdiction and reuses the same
// tier-differentiated GET /api/admin/dashboard/:jurisdictionId National
// Admin's dashboard calls, rather than a separate unrestricted endpoint.
export default function MinistryDashboard() {
  const nationalJurisdictionQuery = useJurisdictionOptions('national');
  const nationalJurisdictionId = nationalJurisdictionQuery.data?.jurisdictions?.[0]?.jurisdictionId;
  const { data, loading, error } = useAdminDashboard(nationalJurisdictionId);

  const states = data?.trends || [];

  return (
    <MinistryLayout title="Ministry Dashboard">
      <div className="space-y-6">
        <div className="grid grid-cols-3 gap-6">
          <StatCard title="Total Cases (Nationwide)" value={data?.total ?? '-'} />
          <StatCard title="High-Risk Cases" value={data?.highRisk ?? '-'} tone="text-rose-600" />
          <StatCard title="Critical Cases" value={data?.critical ?? '-'} tone="text-purple-700" />
        </div>

        <div className="bg-white rounded-xl border border-gray-200/80 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h3 className="font-bold text-sm text-gray-800">State/UT-wise Breakdown</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#EBF4FA]/60 text-gray-600 text-[11px] uppercase tracking-wider font-semibold border-b border-gray-100">
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

        <DeployPolicyWidget jurisdictionId={nationalJurisdictionId} />

        <TrendChart jurisdictionId={nationalJurisdictionId} />
      </div>
    </MinistryLayout>
  );
}
