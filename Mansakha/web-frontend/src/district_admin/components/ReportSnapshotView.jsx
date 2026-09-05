import React from 'react';

// District Admin's own copy of the structured report-snapshot renderer, used
// by Reports.jsx's My Reports (Inbox/Outbox) section - fixes the same flaw
// Ministry's ReportsInbox.jsx has today (a raw JSON.stringify dump) by
// switching on snapshot.tier and rendering each shape with real markup
// instead. Kept generic across all 3 tier shapes (district/state/national)
// even though District itself only ever GENERATES district-tier snapshots,
// since District's Inbox can still receive nothing (District has no
// jurisdiction children reporting up to it) - built generically anyway per
// the no-shared-imports convention (each tier's own byte-similar copy).

const RISK_BADGE = {
  Critical: 'text-[#7c3aed] bg-[#f1e9fd]',
  High: 'text-[#dc4545] bg-[#fce6e6]',
  Moderate: 'text-[#b8860b] bg-[#fdf3d9]',
  Low: 'text-[#519BCE] bg-[#EBF4FA]',
};

const RECIPIENT_BADGE = {
  Draft: 'bg-gray-100 text-gray-600',
  Submitted: 'bg-amber-100 text-amber-700',
  Reviewed: 'bg-emerald-100 text-emerald-700',
};

function MiniStat({ label, value, tone }) {
  const tones = {
    total: 'text-[#3D5A80] bg-[#EBF4FA] border-[#D6E8F5]',
    critical: 'text-[#7c3aed] bg-[#f1e9fd] border-[#e4d3fb]',
    high: 'text-[#dc4545] bg-[#fce6e6] border-[#f7c9c9]',
    moderate: 'text-[#b8860b] bg-[#fdf3d9] border-[#f5e2ad]',
    low: 'text-[#519BCE] bg-[#EBF4FA] border-[#D6E8F5]',
  };
  return (
    <div className={`rounded-lg border px-3 py-2.5 ${tones[tone] || tones.total}`}>
      <p className="text-[10px] font-bold uppercase tracking-wide opacity-70">{label}</p>
      <p className="text-lg font-extrabold">{value ?? 0}</p>
    </div>
  );
}

function SummaryTiles({ summary }) {
  if (!summary) return null;
  return (
    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
      <MiniStat label="Total Cases" value={summary.totalCases} tone="total" />
      <MiniStat label="Critical" value={summary.criticalCases} tone="critical" />
      <MiniStat label="High Risk" value={summary.highRiskCases} tone="high" />
      <MiniStat label="Moderate" value={summary.moderateCases} tone="moderate" />
      <MiniStat label="Low Risk" value={summary.lowRiskCases} tone="low" />
    </div>
  );
}

function RiskBadge({ level }) {
  return <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${RISK_BADGE[level] || 'bg-gray-100 text-gray-600'}`}>{level || '-'}</span>;
}

function CasesTable({ cases }) {
  if (!cases || cases.length === 0) return <p className="text-xs text-gray-400">No cases in this period.</p>;
  const order = { Critical: 0, High: 1, Moderate: 2, Low: 3 };
  const sorted = [...cases].sort((a, b) => (order[a.riskLevel] ?? 9) - (order[b.riskLevel] ?? 9));
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-[10px] uppercase text-gray-400 border-b border-gray-100">
            <th className="py-2 pr-3">Docket</th>
            <th className="py-2 pr-3">Case Type</th>
            <th className="py-2 pr-3">Risk</th>
            <th className="py-2 pr-3">Stage</th>
            <th className="py-2 pr-3">Counsellor</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {sorted.map((c) => (
            <tr key={c.userId}>
              <td className="py-2 pr-3 font-semibold text-gray-700 whitespace-nowrap">{c.docketNumber}</td>
              <td className="py-2 pr-3 text-gray-600">{c.caseTypeName}</td>
              <td className="py-2 pr-3"><RiskBadge level={c.riskLevel} /></td>
              <td className="py-2 pr-3 text-gray-600">{c.caseStage}</td>
              <td className="py-2 pr-3 text-gray-600">{c.counsellorName || '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function JurisdictionRollupTable({ rows, label }) {
  if (!rows || rows.length === 0) return <p className="text-xs text-gray-400">No {label} in this period.</p>;
  const sorted = [...rows].sort((a, b) => (b.criticalCases || 0) - (a.criticalCases || 0));
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-[10px] uppercase text-gray-400 border-b border-gray-100">
            <th className="py-2 pr-3">Name</th>
            <th className="py-2 pr-3">Total</th>
            <th className="py-2 pr-3">Critical</th>
            <th className="py-2 pr-3">High</th>
            <th className="py-2 pr-3">Moderate</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {sorted.map((r) => (
            <tr key={r.jurisdictionId}>
              <td className="py-2 pr-3 font-semibold text-gray-700 whitespace-nowrap">{r.name}</td>
              <td className="py-2 pr-3 text-gray-600">{r.totalCases}</td>
              <td className="py-2 pr-3 text-[#7c3aed] font-semibold">{r.criticalCases}</td>
              <td className="py-2 pr-3 text-[#dc4545] font-semibold">{r.highRiskCases}</td>
              <td className="py-2 pr-3 text-[#b8860b] font-semibold">{r.moderateCases}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Plain flex-bars ("% width/height of the max value") - this codebase's own
// no-charting-library convention (see e.g. state_admin/components/
// BarChart.jsx) - always paired with the exact numbers in a table row right
// below it, per the approved design ("never a chart with no backing
// numbers").
function DistressTrendMini({ trend }) {
  if (!trend || trend.length === 0) return null;
  const max = Math.max(1, ...trend.map((t) => t.avgScore || 0));
  return (
    <div className="space-y-2">
      <div className="flex items-end gap-1.5 h-16">
        {trend.map((t, i) => (
          <div key={i} className="flex-1 h-full flex flex-col items-center justify-end">
            <div
              className="w-full bg-[#519BCE] rounded-sm"
              style={{ height: t.avgScore ? `${(t.avgScore / max) * 100}%` : '2px' }}
            />
          </div>
        ))}
      </div>
      <div className="grid text-[9px] font-semibold text-gray-400" style={{ gridTemplateColumns: `repeat(${trend.length}, minmax(0,1fr))` }}>
        {trend.map((t, i) => <span key={i} className="text-center truncate px-0.5">{t.label}</span>)}
      </div>
      <div className="grid text-[10px] text-gray-500 border-t border-gray-100 pt-1" style={{ gridTemplateColumns: `repeat(${trend.length}, minmax(0,1fr))` }}>
        {trend.map((t, i) => <span key={i} className="text-center">{t.avgScore ?? '-'}</span>)}
      </div>
    </div>
  );
}

function CounsellorRows({ counsellors }) {
  if (!counsellors || counsellors.length === 0) return null;
  return (
    <div className="space-y-1.5">
      {counsellors.map((c) => (
        <div key={c.officialId} className="flex items-center justify-between text-xs bg-gray-50 rounded-md px-3 py-2 gap-3">
          <span className="font-semibold text-gray-700 truncate">{c.fullName}</span>
          <span className="text-gray-500 text-right shrink-0">
            {c.activeCaseCount} active &middot; avg drop {c.avgDistressPointDrop ?? '-'} ({c.usersConsideredForEfficacy ?? 0} scored)
          </span>
        </div>
      ))}
    </div>
  );
}

function ResponseTimesRow({ responseTimes }) {
  if (!responseTimes) return null;
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
      <div className="bg-gray-50 rounded-md px-3 py-2">
        <p className="text-[10px] text-gray-400 uppercase">Avg Acknowledge</p>
        <p className="font-bold text-gray-700">{responseTimes.avgAcknowledgeMinutes ?? '-'} min</p>
      </div>
      <div className="bg-gray-50 rounded-md px-3 py-2">
        <p className="text-[10px] text-gray-400 uppercase">Avg Resolve</p>
        <p className="font-bold text-gray-700">{responseTimes.avgResolveMinutes ?? '-'} min</p>
      </div>
      <div className="bg-gray-50 rounded-md px-3 py-2">
        <p className="text-[10px] text-gray-400 uppercase">Open SOS</p>
        <p className="font-bold text-gray-700">{responseTimes.openSosCount ?? 0}</p>
      </div>
      <div className="bg-gray-50 rounded-md px-3 py-2">
        <p className="text-[10px] text-gray-400 uppercase">Total SOS</p>
        <p className="font-bold text-gray-700">{responseTimes.totalSosCount ?? 0}</p>
      </div>
    </div>
  );
}

// Small pill row so a sender can see who's reviewed a cc'd report and who
// hasn't - exported separately so Reports.jsx can place it outside the
// snapshot body (next to the recipients heading) if that reads better.
export function RecipientPills({ recipients }) {
  if (!recipients || recipients.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {recipients.map((r) => (
        <span
          key={r.recipientId}
          className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-semibold ${RECIPIENT_BADGE[r.status] || 'bg-gray-100 text-gray-600'}`}
        >
          {r.jurisdictionName || r.recipientType}
          {r.isPrimary ? ' (Primary)' : ''} &middot; {r.status}
        </span>
      ))}
    </div>
  );
}

export default function ReportSnapshotView({ snapshot }) {
  if (!snapshot) return <p className="text-xs text-gray-400">No snapshot data available for this report.</p>;

  return (
    <div className="space-y-4">
      <SummaryTiles summary={snapshot.summary} />

      {snapshot.tier === 'district' && (
        <div>
          <p className="text-[11px] font-bold text-gray-500 uppercase mb-1.5">Cases</p>
          <CasesTable cases={snapshot.cases} />
        </div>
      )}
      {snapshot.tier === 'state' && (
        <div>
          <p className="text-[11px] font-bold text-gray-500 uppercase mb-1.5">Districts</p>
          <JurisdictionRollupTable rows={snapshot.districts} label="districts" />
        </div>
      )}
      {snapshot.tier === 'national' && (
        <div>
          <p className="text-[11px] font-bold text-gray-500 uppercase mb-1.5">States</p>
          <JurisdictionRollupTable rows={snapshot.states} label="states" />
        </div>
      )}

      {snapshot.distressTrend && snapshot.distressTrend.length > 0 && (
        <div>
          <p className="text-[11px] font-bold text-gray-500 uppercase mb-1.5">Distress Trend</p>
          <DistressTrendMini trend={snapshot.distressTrend} />
        </div>
      )}

      {snapshot.counsellors && snapshot.counsellors.length > 0 && (
        <div>
          <p className="text-[11px] font-bold text-gray-500 uppercase mb-1.5">Counsellor Performance</p>
          <CounsellorRows counsellors={snapshot.counsellors} />
        </div>
      )}

      {snapshot.responseTimes && (
        <div>
          <p className="text-[11px] font-bold text-gray-500 uppercase mb-1.5">SOS Response Times</p>
          <ResponseTimesRow responseTimes={snapshot.responseTimes} />
        </div>
      )}
    </div>
  );
}
