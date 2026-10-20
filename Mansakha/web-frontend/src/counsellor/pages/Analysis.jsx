import React, { useState } from 'react';
import { usePageHeader } from '../../shared/context/PageHeaderContext';
import { useCounsellorDashboard, useReportsAnalytics } from '../services/hooks';

// Counsellor's own Analysis page - simplified to just Counsellor's own
// dashboard data (no admin/jurisdiction branching, since this file only ever
// serves Counsellor now). No CSV export here - that's an Administration-only
// action (GET /api/admin/.../export).
//
// This used to be named "Reports" - renamed (page, nav item, and route) to
// match the District/State/National tiers' own Reports/Analysis split: read-
// only analytics belongs under Analysis, not Reports. Counsellor never gets
// the new case-wise/district-wise/state-wise report generate/submit/review
// workflow those tiers now have (explicitly out of scope - Counsellor isn't
// part of that reporting hierarchy), so there's no separate Reports page
// left to keep here; this content is ALL Counsellor's "Reports" page ever
// was, so it's a rename in place, not a split into two pages.

const RANGE_MAP = {
  'Last 7 Days': '7d',
  'Last 30 Days': '30d',
  'Last 90 Days': '90d',
  'Custom Range': 'custom',
};

export default function Analysis() {
  usePageHeader({ title: 'Analysis' });
  const [timeRange, setTimeRange] = useState('Last 30 Days');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  const { data: counsellorData } = useCounsellorDashboard();

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
  } = useReportsAnalytics(range, customStart, customEnd);

  const trend = analyticsData?.trend || [];
  const severityDistribution = analyticsData?.severityDistribution || [];
  const interventionPhases = analyticsData?.interventionPhases || { completed: 0, inProgress: 0, planned: 0 };

  const total = counsellorData?.total || 0;
  const high = counsellorData?.high || 0;
  const critical = counsellorData?.critical || 0;
  const moderate = counsellorData?.moderate || 0;

  return (
<>
      <div className="space-y-6">

        {/* TOP CONTROLS & DATE FILTER */}
        <div className="bg-white p-3 sm:p-4 rounded-xl border border-gray-200/80 shadow-sm flex flex-col sm:flex-row flex-wrap items-start sm:items-center gap-3">
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            {['Last 7 Days', 'Last 30 Days', 'Last 90 Days', 'Custom Range'].map((r) => (
              <button
                key={r}
                onClick={() => setTimeRange(r)}
                className={`px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs font-semibold transition ${
                  timeRange === r
                    ? 'bg-brand-700/15 text-brand-600'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                {r}
              </button>
            ))}
          </div>

          {isCustom && (
            <div className="flex flex-wrap items-center gap-2 text-xs pt-2 sm:pt-0 border-t sm:border-0 border-gray-100 w-full sm:w-auto">
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
                <span className="text-rose-600 font-semibold text-xs">End date can't be before start date.</span>
              )}
            </div>
          )}
        </div>

        {/* TOP ROW: 2 CHARTS */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">

          {/* Average Distress Severity Trends */}
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

          {/* Severity Distribution Stacked Matrix */}
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

          {/* Intervention Phase Breakdown */}
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
          <StatCard
            title="TOTAL CASELOAD"
            value={total}
            subtitle="Assigned to you"
            accent="blue"
          />
          <StatCard
            title="VULNERABLE (MODERATE)"
            value={moderate}
            subtitle="Requires monitoring"
            accent="amber"
          />
          <StatCard
            title="HIGH-RISK CASES"
            value={high}
            subtitle="High risk level"
            accent="orange"
          />
          <StatCard
            title="CRITICAL CASES"
            value={critical}
            subtitle="Immediate attention"
            accent="red"
          />
        </div>

      </div>
    </>
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
          {path && <path d={path} fill="none" stroke="#DC2626" strokeWidth="2.5" />}
          {points.map((p, i) => p.y !== null && (
            <circle key={i} cx={p.x} cy={p.y} r="3" fill="#DC2626" />
          ))}
        </svg>
      </div>
      <div
        className="grid text-[8px] font-semibold text-gray-400 px-2 pt-2 border-t border-gray-100 ml-8"
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
              <div className="bg-[#b91c1c] w-full rounded-sm" style={{ height: `${(item.critical / maxTotal) * 100}%` }}></div>
              <div className="bg-[#ea580c] w-full rounded-sm" style={{ height: `${(item.high / maxTotal) * 100}%` }}></div>
              <div className="bg-[#f59e0b] w-full rounded-sm" style={{ height: `${(item.moderate / maxTotal) * 100}%` }}></div>
              <div className="bg-[#10b981] w-full rounded-sm" style={{ height: `${(item.low / maxTotal) * 100}%` }}></div>
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

      {/* Legend */}
      <div className="flex items-center gap-4 text-[11px] font-semibold text-gray-600 pt-1">
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-[#b91c1c]"></span> Critical
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-[#ea580c]"></span> High
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-[#f59e0b]"></span> Moderate
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-[#10b981]"></span> Low
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
      {/* Donut graphic */}
      <div className="relative w-40 h-40 flex items-center justify-center">
        <svg className="w-full h-full -rotate-90 transform" viewBox="0 0 36 36">
          {/* Background circle */}
          <circle
            cx="18"
            cy="18"
            r="15.91549430918954"
            fill="none"
            stroke="#F3F4F6"
            strokeWidth="4"
          />
          {/* Segment 1: Completed */}
          <circle
            cx="18"
            cy="18"
            r="15.91549430918954"
            fill="none"
            stroke="#10B981"
            strokeWidth="4"
            strokeDasharray={`${completedPct}, 100`}
            strokeDashoffset="0"
            className="transition-all duration-1000 ease-out"
          />
          {/* Segment 2: In Progress */}
          <circle
            cx="18"
            cy="18"
            r="15.91549430918954"
            fill="none"
            stroke="#5b62c2"
            strokeWidth="4"
            strokeDasharray={`${inProgressPct}, 100`}
            strokeDashoffset={`${-completedPct}`}
            className="transition-all duration-1000 ease-out delay-150"
          />
          {/* Segment 3: Planned */}
          <circle
            cx="18"
            cy="18"
            r="15.91549430918954"
            fill="none"
            stroke="#F59E0B"
            strokeWidth="4"
            strokeDasharray={`${plannedPct}, 100`}
            strokeDashoffset={`${-(completedPct + inProgressPct)}`}
            className="transition-all duration-1000 ease-out delay-300"
          />
        </svg>
        {/* Center text */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xl font-extrabold text-gray-800">{Math.round(completedPct)}%</span>
          <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">Completed</span>
        </div>
      </div>

      {/* Legend List */}
      <div className="space-y-4 mt-6 sm:mt-0 text-sm font-semibold text-gray-700">
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 rounded-full bg-emerald-500 shadow-sm ring-2 ring-emerald-100"></div>
          <span>Completed Actions <span className="text-gray-400 ml-2">{Math.round(completedPct)}%</span></span>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 rounded-full bg-brand-500 shadow-sm ring-2 ring-brand-100"></div>
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
    blue: 'border-brand-200 bg-brand-50/50 text-brand-600',
    amber: 'border-amber-200 bg-amber-50/50 text-amber-600',
    orange: 'border-orange-200 bg-orange-50/50 text-orange-600',
    red: 'border-red-200 bg-red-50/50 text-red-600',
    emerald: 'border-emerald-200 bg-emerald-50/50 text-emerald-600',
    purple: 'border-purple-200 bg-purple-50/50 text-purple-600',
    rose: 'border-rose-200 bg-rose-50/50 text-rose-600',
    gray: 'border-gray-200 bg-gray-50/50 text-gray-600'
  };

  return (
    <div className={`relative p-5 rounded-2xl border ${accents[accent].split(' ')[0]} bg-white shadow-sm hover:shadow-md transition-shadow duration-300 space-y-2 overflow-hidden group`}>
      <div className={`absolute top-0 right-0 w-24 h-24 -mr-8 -mt-8 rounded-full ${accents[accent].split(' ')[1]} opacity-50 group-hover:scale-150 transition-transform duration-700 ease-out`}></div>
      <span className="relative text-[10px] font-bold tracking-wider text-gray-500 uppercase block">
        {title}
      </span>
      <span className="relative text-3xl font-extrabold text-gray-900 block tracking-tight">
        {value}
      </span>
      <span className="relative text-[11px] font-semibold text-gray-400 block">
        {subtitle}
      </span>
    </div>
  );
}
