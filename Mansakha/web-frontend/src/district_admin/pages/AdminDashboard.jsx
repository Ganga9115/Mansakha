import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import StaffLayout from '../layouts/StaffLayout';
import { FileDown } from 'lucide-react';
import { useMyJurisdiction, useAdminDashboard, useExportReportCsv, useAdminAlerts, useReportsAnalytics } from '../services/hooks';

const RISK_BADGE = {
  Critical: 'bg-purple-100 text-purple-700',
  High: 'bg-rose-100 text-rose-700',
  Moderate: 'bg-amber-100 text-amber-700',
  Low: 'bg-emerald-100 text-emerald-700',
};

// Matches AdminAlerts.jsx's own STATUS_STYLE - alerts carry a status
// (Open/Acknowledged/Resolved), not a risk level, so the badge here keys off
// the same field the full Alerts Feed page already uses.
const STATUS_BADGE = {
  Open: 'bg-rose-100 text-rose-700',
  Acknowledged: 'bg-amber-100 text-amber-700',
  Resolved: 'bg-emerald-100 text-emerald-700',
};

function StatCard({ title, value, tone }) {
  return (
    <div className="bg-white p-5 rounded-xl border border-gray-200/80 shadow-sm space-y-1">
      <span className="text-[10px] font-bold tracking-wider text-gray-400 uppercase block">{title}</span>
      <span className={`text-2xl font-bold block ${tone || 'text-gray-800'}`}>{value}</span>
    </div>
  );
}

// District Administration is the "operational" admin tier - they see the
// case list and can drill directly into CaseDetail (same as a counsellor,
// read-only), rather than State/National which just see aggregate
// breakdowns of their children.
export default function AdminDashboard() {
  const navigate = useNavigate();
  const { jurisdictionId, loading: jurisdictionLoading } = useMyJurisdiction();
  const { data, loading, error } = useAdminDashboard(jurisdictionId);
  // The dashboard's own /dashboard/:jurisdictionId response never carries
  // alerts/trend (district branch returns trends: null and no alerts key at
  // all) - these two panels were dead on arrival. AdminAlerts.jsx and
  // Reports.jsx already fetch the real thing correctly, so reuse those same
  // hooks/endpoints here instead of inventing a third data source.
  const { data: alertsData } = useAdminAlerts(jurisdictionId);
  const { data: analyticsData } = useReportsAnalytics(jurisdictionId, '30d');
  const openAlerts = (alertsData?.alerts || []).filter((a) => a.status !== 'Resolved').slice(0, 5);
  const trend = (analyticsData?.trend || [])
    .filter((t) => t.avgScore !== null && t.avgScore !== undefined)
    .map((t) => ({ period: t.label, avgScore: t.avgScore }));
  const exportReport = useExportReportCsv();
  const [reportStatus, setReportStatus] = useState(null);

  const handleGenerateReport = async () => {
    setReportStatus(null);
    try {
      await exportReport.mutate(jurisdictionId, 'district_report');
      setReportStatus('Report downloaded successfully.');
    } catch (err) {
      setReportStatus(err.message || 'Could not download report.');
    }
  };

  return (
    <StaffLayout title="District Dashboard">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 w-full">
            <StatCard title="Total Cases" value={data?.totalCases ?? '-'} />
            <StatCard title="Vulnerable (Moderate)" value={data?.vulnerableUsers ?? '-'} tone="text-emerald-600" />
            <StatCard title="High-Risk Cases" value={data?.highRiskCases ?? '-'} tone="text-rose-600" />
            <StatCard title="Critical (SOS)" value={data?.criticalCases ?? '-'} tone="text-purple-700" />
            <StatCard title="Predicted Escalations" value={data?.predictedEscalations ?? '-'} tone="text-orange-600" />
          </div>
        </div>

        {/* Coordination-role at-a-glance counts - the live-dashboard
            counterpart to the periodic Report's own Threat & Protection /
            Compensation & Relief sections, cheap enough to compute on every
            page load (see backend's countNewRoleDashboardStats). Kept as
            its own small row rather than folded into the risk-tier grid
            above - a different axis (is a case being actively handled by
            the role it was sent to, not how distressed the victim is). */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full sm:w-1/2">
          <StatCard title="Open Protection Referrals" value={data?.openProtectionReferrals ?? '-'} tone="text-rose-600" />
          <StatCard title="Compensation Pending" value={data?.compensationPendingCount ?? '-'} tone="text-amber-600" />
        </div>

        <div className="flex items-start justify-between">
          <h2 className="text-xl font-bold text-gray-800">Cases</h2>
          <div className="text-right">
            <button
              onClick={handleGenerateReport}
              disabled={exportReport.loading || !jurisdictionId}
              className="flex items-center gap-2 px-4 py-2 bg-[#519BCE] hover:bg-[#3d83b3] text-white rounded-lg text-xs font-semibold shadow-sm transition disabled:opacity-60 shrink-0"
            >
              <FileDown size={14} />
              {exportReport.loading ? 'Downloading...' : 'Download CSV Report'}
            </button>
            {reportStatus && (
              <div className="text-xs mt-2 font-medium text-emerald-600">{reportStatus}</div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          <div className="col-span-2 bg-white rounded-xl border border-gray-200/80 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100">
              <h3 className="font-bold text-sm text-gray-800">Cases</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#EBF4FA]/60 text-gray-600 text-[11px] uppercase tracking-wider font-semibold border-b border-gray-100">
                    <th className="py-3 px-6">User ID</th>
                    <th className="py-3 px-4">Case Stage</th>
                    <th className="py-3 px-4">Score</th>
                    <th className="py-3 px-4">Risk</th>
                    <th className="py-3 px-6 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-xs">
                  {jurisdictionLoading || loading ? (
                    <tr><td colSpan={5} className="py-8 text-center text-gray-400">Loading...</td></tr>
                  ) : error ? (
                    <tr><td colSpan={5} className="py-8 text-center text-rose-600">{error}</td></tr>
                  ) : (data?.cases || []).length === 0 ? (
                    <tr><td colSpan={5} className="py-8 text-center text-gray-400">No cases in this district yet.</td></tr>
                  ) : data.cases.map((item) => (
                    <tr key={item.userId} className="hover:bg-gray-50/70 transition">
                      <td className="py-3.5 px-6 font-bold text-gray-800">Case {item.userId.slice(0, 8)}</td>
                      <td className="py-3.5 px-4 text-gray-700 font-medium">{item.caseStage || '-'}</td>
                      <td className="py-3.5 px-4 font-bold text-gray-800">{item.score ?? '-'}</td>
                      <td className="py-3.5 px-4">
                        {item.riskLevel ? (
                          <span className={`px-2.5 py-1 rounded text-[10px] font-bold ${RISK_BADGE[item.riskLevel] || 'bg-gray-100 text-gray-600'}`}>
                            {item.riskLevel}
                          </span>
                        ) : <span className="text-gray-400">-</span>}
                      </td>
                      <td className="py-3.5 px-6 text-right">
                        <button
                          onClick={() => navigate(`/districtadmin/case-detail/${item.userId}`)}
                          className="px-3 py-1.5 border border-[#519BCE] text-[#519BCE] hover:bg-[#519BCE] hover:text-white rounded-md text-xs font-medium transition"
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="space-y-6">
            <div className="bg-white p-6 rounded-xl border border-gray-200/80 shadow-sm">
              <h3 className="font-bold text-sm text-gray-800 mb-4">Alerts</h3>
              {openAlerts.length === 0 ? (
                <p className="text-xs text-gray-400">No open alerts.</p>
              ) : (
                <div className="space-y-3 text-xs">
                  {openAlerts.map((a) => (
                    <div key={a.alertId} className="flex items-center justify-between border-b border-gray-50 pb-2">
                      <span className="text-gray-600 font-medium">Case {String(a.userId).slice(0, 8)}</span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${STATUS_BADGE[a.status] || 'bg-gray-100 text-gray-600'}`}>{a.status}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-white p-6 rounded-xl border border-gray-200/80 shadow-sm">
              <h3 className="font-bold text-sm text-gray-800 mb-4">Distress Trend</h3>
              {trend.length === 0 ? (
                <p className="text-xs text-gray-400">Not enough data yet.</p>
              ) : (
                <div className="space-y-2">
                  {trend.map((t) => (
                    <div key={t.period} className="flex items-center gap-3 text-xs">
                      <span className="w-16 text-gray-500 shrink-0">{t.period}</span>
                      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-[#519BCE] rounded-full" style={{ width: `${Math.min(100, t.avgScore)}%` }} />
                      </div>
                      <span className="font-bold text-gray-700 w-8 text-right">{t.avgScore}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </StaffLayout>
  );
}
