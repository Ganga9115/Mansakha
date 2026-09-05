import React, { useState } from 'react';
import StaffLayout from '../layouts/StaffLayout';
import { Download } from 'lucide-react';
import BarChart from '../components/BarChart';
import { useMyJurisdiction, useAdminDashboard, useExportReportCsv, useReportsAnalytics } from '../services/hooks';

// National Admin's Analysis page - cross-state comparison bars (below),
// calling the exact same GET /api/admin/national/dashboard/:jurisdictionId
// NationalDashboard.jsx already uses so these numbers can never drift from
// what the dashboard shows. Also carries National's own time-series/severity/
// intervention analytics (moved out of Reports.jsx, which is now purely the
// state-wise report generate/submit/review workflow - that page's content
// is a periodic report record National sends to Ministry, not open-ended
// analysis of National's ongoing caseload, and the two don't belong mixed
// into one page).

const RANGE_MAP = {
  'Last 7 Days': '7d',
  'Last 30 Days': '30d',
  'Last 90 Days': '90d',
  'Custom Range': 'custom',
};

export default function Analysis() {
  const { jurisdictionId, loading: jurisdictionLoading } = useMyJurisdiction();
  const { data, loading, error } = useAdminDashboard(jurisdictionId);

  const [timeRange, setTimeRange] = useState('Last 30 Days');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const exportReport = useExportReportCsv();

  const range = RANGE_MAP[timeRange];
  const isCustom = range === 'custom';
  const customBothFilled = Boolean(customStart && customEnd);
  const customRangeInvalid = customBothFilled && customEnd < customStart;
  const customReady = customBothFilled && !customRangeInvalid;
  const chartsPending = isCustom && !customReady;

  const {
    data: analyticsData,
    loading: analyticsLoading,
    error: analyticsError,
  } = useReportsAnalytics(jurisdictionId, range, customStart, customEnd);

  const trend = analyticsData?.trend || [];
  const severityDistribution = analyticsData?.severityDistribution || [];
  const interventionPhases = analyticsData?.interventionPhases || { completed: 0, inProgress: 0, planned: 0 };

  const total = data?.totalCases || data?.total || 0;
  const high = data?.highRiskCases || data?.high || 0;
  const critical = data?.criticalCases || data?.critical || 0;
  const moderate = data?.vulnerableUsers || data?.moderate || 0;

  const handleExportCsv = async () => {
    try {
      await exportReport.mutate(jurisdictionId);
    } catch (err) {
      console.error('CSV Export Error:', err);
    }
  };

  const rows = data?.trends || [];

  return (
    <StaffLayout title="Analysis">
      <div className="space-y-8">

        <section className="space-y-4">
          <h3 className="font-bold text-sm text-gray-800">Cross-State Comparison</h3>
          {jurisdictionLoading || loading ? (
            <p className="text-sm text-gray-400">Loading...</p>
          ) : error ? (
            <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm px-4 py-3 rounded-lg">{error}</div>
          ) : rows.length === 0 ? (
            <p className="text-sm text-gray-400">No state data yet.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <BarChart
                title="Total Cases by State"
                subtitle="Highest first - where caseload is concentrated."
                items={rows.map((r) => ({ jurisdictionId: r.jurisdictionId, name: r.name, value: r.total }))}
                valueLabel="cases"
                barColor="bg-[#519BCE]"
              />
              <BarChart
                title="Critical Cases by State"
                subtitle="Highest first - where the most urgent cases are concentrated."
                items={rows.map((r) => ({ jurisdictionId: r.jurisdictionId, name: r.name, value: r.critical }))}
                valueLabel="cases"
                barColor="bg-purple-600"
              />
              <BarChart
                title="High-Risk Cases by State"
                subtitle="Highest first - cases flagged High but not yet Critical."
                items={rows.map((r) => ({ jurisdictionId: r.jurisdictionId, name: r.name, value: r.highRisk }))}
                valueLabel="cases"
                barColor="bg-rose-500"
              />
              <BarChart
                title="Vulnerable Cases by State"
                subtitle="Highest first - cases flagged Moderate risk."
                items={rows.map((r) => ({ jurisdictionId: r.jurisdictionId, name: r.name, value: r.vulnerable }))}
                valueLabel="cases"
                barColor="bg-amber-500"
              />
            </div>
          )}
        </section>

        <section className="space-y-4 pt-4 border-t border-gray-200/80">
          <h3 className="font-bold text-sm text-gray-800">Time-Series Analytics</h3>

          {/* TOP CONTROLS & DATE FILTER */}
          <div className="bg-white p-4 rounded-xl border border-gray-200/80 shadow-sm flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              {['Last 7 Days', 'Last 30 Days', 'Last 90 Days', 'Custom Range'].map((r) => (
                <button
                  key={r}
                  onClick={() => setTimeRange(r)}
                  className={`px-4 py-2 rounded-lg text-xs font-semibold transition ${
                    timeRange === r
                      ? 'bg-[#519BCE]/15 text-[#519BCE]'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>

            {isCustom && (
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <label className="flex items-center gap-1.5 text-gray-600 font-semibold">
                  From
                  <input
                    type="date"
                    value={customStart}
                    max={customEnd || undefined}
                    onChange={(e) => setCustomStart(e.target.value)}
                    className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-gray-700"
                  />
                </label>
                <label className="flex items-center gap-1.5 text-gray-600 font-semibold">
                  To
                  <input
                    type="date"
                    value={customEnd}
                    min={customStart || undefined}
                    onChange={(e) => setCustomEnd(e.target.value)}
                    className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-gray-700"
                  />
                </label>
                {customRangeInvalid && (
                  <span className="text-rose-600 font-semibold">End date can't be before start date.</span>
                )}
              </div>
            )}

            <button
              onClick={handleExportCsv}
              disabled={exportReport.loading}
              className="ml-auto flex items-center gap-2 px-4 py-2 bg-[#519BCE] hover:bg-[#3d83b3] text-white rounded-lg text-xs font-semibold shadow-sm transition disabled:opacity-60"
            >
              <Download size={14} />
              {exportReport.loading ? 'Exporting CSV...' : 'Export Audit CSV'}
            </button>
          </div>

          {/* TOP ROW: 2 CHARTS */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">

            <div className="bg-white p-6 rounded-xl border border-gray-200/80 shadow-sm space-y-4">
              <h3 className="font-bold text-sm text-gray-800">
                Average Distress Severity Trends
              </h3>

              <ChartStatus
                pending={chartsPending}
                invalid={customRangeInvalid}
                loading={analyticsLoading}
                error={analyticsError}
              >
                <TrendChart trend={trend} />
              </ChartStatus>
            </div>

            <div className="bg-white p-6 rounded-xl border border-gray-200/80 shadow-sm space-y-4">
              <h3 className="font-bold text-sm text-gray-800">
                Severity Distribution Stacked Matrix
              </h3>

              <ChartStatus
                pending={chartsPending}
                invalid={customRangeInvalid}
                loading={analyticsLoading}
                error={analyticsError}
              >
                <SeverityStackedChart severityDistribution={severityDistribution} />
              </ChartStatus>
            </div>

          </div>

          {/* BOTTOM ROW: DONUT CHART */}
          <div className="grid grid-cols-1 gap-6">

            <div className="bg-gradient-to-br from-white to-gray-50 p-6 rounded-2xl border border-gray-200/60 shadow-md space-y-4">
              <h3 className="font-bold text-sm text-gray-800 tracking-wide">
                Intervention Phase Breakdown
              </h3>

              <ChartStatus
                pending={chartsPending}
                invalid={customRangeInvalid}
                loading={analyticsLoading}
                error={analyticsError}
              >
                <InterventionDonut interventionPhases={interventionPhases} />
              </ChartStatus>
            </div>
          </div>

          {/* 4 STATS CARDS AT THE BOTTOM */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <StatCard title="TOTAL CASELOAD" value={total} subtitle="Across every state" accent="blue" />
            <StatCard title="VULNERABLE (MODERATE)" value={moderate} subtitle="Requires monitoring" accent="emerald" />
            <StatCard title="HIGH-RISK CASES" value={high} subtitle="High risk level" accent="rose" />
            <StatCard title="CRITICAL CASES" value={critical} subtitle="Immediate attention" accent="purple" />
          </div>
        </section>

      </div>
    </StaffLayout>
  );
}

// --- Shared chart building blocks (kept local to this file, per the
// no-shared-imports rule other pages/services in this role folder follow) ---

function ChartStatus({ pending, invalid, loading, error, children }) {
  if (pending) {
    return (
      <div className="h-44 flex items-center justify-center text-center text-xs text-gray-400 px-6">
        {invalid ? 'Fix the date range above to load this chart.' : 'Select a start and end date above to load this chart.'}
      </div>
    );
  }
  if (loading) {
    return (
      <div className="h-44 flex items-center justify-center text-xs text-gray-400">
        Loading...
      </div>
    );
  }
  if (error) {
    return (
      <div className="h-44 flex items-center justify-center text-center text-xs text-rose-600 px-6">
        {error}
      </div>
    );
  }
  return children;
}

function TrendChart({ trend }) {
  const points = trend.map((t, i) => {
    const x = trend.length > 1 ? (i / (trend.length - 1)) * 500 : 250;
    const y = t.avgScore === null || t.avgScore === undefined
      ? null
      : 90 - (Math.max(0, Math.min(100, t.avgScore)) / 100) * 80;
    return { x, y, label: t.label };
  });

  const path = buildGappedPath(points);

  return (
    <div className="h-44 relative flex flex-col justify-between pt-4">
      <svg className="w-full h-32 overflow-visible" viewBox="0 0 500 100">
        <line x1="0" y1="50" x2="500" y2="50" stroke="#E5E7EB" strokeDasharray="4 4" />
        {path && <path d={path} fill="none" stroke="#DC2626" strokeWidth="2.5" />}
        {points.map((p, i) => p.y !== null && (
          <circle key={i} cx={p.x} cy={p.y} r="3" fill="#DC2626" />
        ))}
      </svg>
      <div
        className="grid text-[8px] font-semibold text-gray-400 px-2 pt-2 border-t border-gray-100"
        style={{ gridTemplateColumns: `repeat(${Math.max(trend.length, 1)}, minmax(0, 1fr))` }}
      >
        {trend.map((t, i) => <span key={i} className="text-center whitespace-nowrap">{t.label}</span>)}
      </div>
    </div>
  );
}

function buildGappedPath(points) {
  const segments = [];
  let current = [];
  points.forEach((p) => {
    if (p.y === null) {
      if (current.length) { segments.push(current); current = []; }
      return;
    }
    current.push(`${current.length === 0 ? 'M' : 'L'} ${p.x} ${p.y}`);
  });
  if (current.length) segments.push(current);
  return segments.map((seg) => seg.join(' ')).join(' ');
}

function SeverityStackedChart({ severityDistribution }) {
  const maxTotal = Math.max(1, ...severityDistribution.map((b) => b.critical + b.high + b.moderate + b.low));

  return (
    <div className="h-44 flex flex-col justify-between">
      <div className="h-32 flex items-end justify-between px-6 pt-2">
        {severityDistribution.map((item, i) => (
          <div key={i} className="flex flex-col items-center gap-2 w-8">
            <div className="w-4 h-28 flex flex-col justify-end gap-1 rounded overflow-hidden">
              <div className="bg-purple-700 w-full rounded-sm" style={{ height: `${(item.critical / maxTotal) * 100}%` }}></div>
              <div className="bg-red-600 w-full rounded-sm" style={{ height: `${(item.high / maxTotal) * 100}%` }}></div>
              <div className="bg-amber-500 w-full rounded-sm" style={{ height: `${(item.moderate / maxTotal) * 100}%` }}></div>
              <div className="bg-emerald-600 w-full rounded-sm" style={{ height: `${(item.low / maxTotal) * 100}%` }}></div>
            </div>
          </div>
        ))}
      </div>

      <div
        className="grid text-[8px] font-semibold text-gray-400 px-2 pt-2 border-t border-gray-100"
        style={{ gridTemplateColumns: `repeat(${Math.max(severityDistribution.length, 1)}, minmax(0, 1fr))` }}
      >
        {severityDistribution.map((item, i) => <span key={i} className="text-center whitespace-nowrap">{item.label}</span>)}
      </div>

      <div className="flex items-center gap-4 text-[11px] font-semibold text-gray-600 pt-1">
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-purple-700"></span> Critical
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-red-600"></span> High
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-amber-500"></span> Moderate
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-emerald-600"></span> Low
        </span>
      </div>
    </div>
  );
}

function InterventionDonut({ interventionPhases }) {
  const { completed = 0, inProgress = 0, planned = 0 } = interventionPhases || {};
  const donutTotal = completed + inProgress + planned;

  if (donutTotal === 0) {
    return (
      <div className="py-10 text-center text-sm text-gray-400">
        No interventions in this period.
      </div>
    );
  }

  const completedPct = (completed / donutTotal) * 100;
  const inProgressPct = (inProgress / donutTotal) * 100;
  const plannedPct = (planned / donutTotal) * 100;

  return (
    <div className="flex flex-col sm:flex-row items-center justify-around py-4">
      <div className="relative w-40 h-40">
        <svg className="w-full h-full -rotate-90 drop-shadow-sm" viewBox="0 0 36 36">
          <path
            d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
            fill="none"
            stroke="#F3F4F6"
            strokeWidth="4"
          />
          <path
            d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
            fill="none"
            stroke="#10B981"
            strokeWidth="4"
            strokeDasharray={`${completedPct}, 100`}
            className="transition-all duration-1000 ease-out"
          />
          <path
            d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
            fill="none"
            stroke="#3B82F6"
            strokeWidth="4"
            strokeDasharray={`${inProgressPct}, 100`}
            strokeDashoffset={`${-completedPct}`}
            className="transition-all duration-1000 ease-out delay-150"
          />
          <path
            d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
            fill="none"
            stroke="#F59E0B"
            strokeWidth="4"
            strokeDasharray={`${plannedPct}, 100`}
            strokeDashoffset={`${-(completedPct + inProgressPct)}`}
            className="transition-all duration-1000 ease-out delay-300"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xl font-extrabold text-gray-800">{Math.round(completedPct)}%</span>
          <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">Completed</span>
        </div>
      </div>

      <div className="space-y-4 mt-6 sm:mt-0 text-sm font-semibold text-gray-700">
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 rounded-full bg-emerald-500 shadow-sm ring-2 ring-emerald-100"></div>
          <span>Completed Actions <span className="text-gray-400 ml-2">{Math.round(completedPct)}%</span></span>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 rounded-full bg-blue-500 shadow-sm ring-2 ring-blue-100"></div>
          <span>In Progress Queue <span className="text-gray-400 ml-2">{Math.round(inProgressPct)}%</span></span>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 rounded-full bg-amber-500 shadow-sm ring-2 ring-amber-100"></div>
          <span>Planned / Referred <span className="text-gray-400 ml-2">{Math.round(plannedPct)}%</span></span>
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value, subtitle, accent = 'gray' }) {
  const accents = {
    blue: 'border-blue-200 bg-blue-50/50 text-blue-600',
    emerald: 'border-emerald-200 bg-emerald-50/50 text-emerald-600',
    purple: 'border-purple-200 bg-purple-50/50 text-purple-600',
    rose: 'border-rose-200 bg-rose-50/50 text-rose-600',
    gray: 'border-gray-200 bg-gray-50/50 text-gray-600'
  };

  return (
    <div className={`relative p-5 rounded-2xl border ${accents[accent].split(' ')[0]} bg-white shadow-sm hover:shadow-md transition-shadow duration-300 space-y-2 overflow-hidden group`}>
      <div className={`absolute top-0 right-0 w-24 h-24 -mr-8 -mt-8 rounded-full ${accents[accent].split(' ')[1]} opacity-50 group-hover:scale-150 transition-transform duration-700 ease-out`}></div>
      <span className="relative text-[10px] font-bold tracking-wider text-gray-500 uppercase block">{title}</span>
      <span className="relative text-3xl font-extrabold text-gray-900 block tracking-tight">{value}</span>
      <span className="relative text-[11px] font-semibold text-gray-400 block">{subtitle}</span>
    </div>
  );
}
