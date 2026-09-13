import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import StaffLayout from '../layouts/StaffLayout';
import { FileDown, FileText, ShieldCheck, AlertCircle, ShieldAlert, TrendingUp, Users, IndianRupee, Calendar, ChevronDown, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { useMyJurisdiction, useAdminDashboard, useExportReportCsv, useAdminAlerts, useReportsAnalytics, useMe } from '../services/hooks';

const RISK_BADGE = {
  Critical: 'bg-red-100 text-red-800 border border-red-300',
  High: 'bg-orange-100 text-orange-800 border border-orange-300',
  Moderate: 'bg-amber-100 text-amber-700',
  Low: 'bg-emerald-100 text-emerald-800 border border-emerald-300',
};

// Matches AdminAlerts.jsx's own STATUS_STYLE - alerts carry a status
// (Open/Acknowledged/Resolved), not a risk level, so the badge here keys off
// the same field the full Alerts Feed page already uses.
const STATUS_BADGE = {
  Open: 'bg-rose-100 text-rose-700',
  Acknowledged: 'bg-amber-100 text-amber-700',
  Resolved: 'bg-emerald-100 text-emerald-700',
};

function StatCard({ title, value, colorClass }) {
  return (
    <div className={`p-4 bg-white rounded-lg border border-gray-200 shadow-sm flex flex-col justify-between min-h-[95px] transition-colors duration-200 ${colorClass.hoverBorder || 'hover:border-gray-400'}`}>
      <span className="text-[10px] font-bold tracking-wider text-gray-500 uppercase">{title}</span>
      <div className="flex items-end justify-between mt-2">
        <span className={`text-[32px] leading-none font-extrabold ${colorClass.text}`}>{value}</span>
      </div>
    </div>
  );
}

// District Administration is the "operational" admin tier - they see the
// case list and can drill directly into CaseDetail (same as a counsellor,
// read-only), rather than State/National which just see aggregate
// breakdowns of their children.
export default function AdminDashboard() {
  const navigate = useNavigate();
  const { data: me } = useMe();
  const { jurisdictionId, loading: jurisdictionLoading } = useMyJurisdiction();
  const { data, loading, error } = useAdminDashboard(jurisdictionId);
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
      <div className="space-y-6 max-w-[1400px]">
        {/* Header Section */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-[22px] font-extrabold text-[#1a2b4b]">Good morning, {me?.fullName || 'District Admin'}</h1>
            <p className="text-[13px] text-gray-500 mt-1">Here's an overview of cases and activities across your district.</p>
          </div>
        </div>

        {/* Top 5 Metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <StatCard
            title="Total Cases"
            value={data?.totalCases ?? '-'}
            colorClass={{ text: 'text-[#1d4ed8]', hoverBorder: 'hover:border-[#1d4ed8]' }}
          />
          <StatCard
            title="Vulnerable (Moderate)"
            value={data?.vulnerableUsers ?? '-'}
            colorClass={{ text: 'text-[#15803d]', hoverBorder: 'hover:border-[#15803d]' }}
          />
          <StatCard
            title="High-Risk Cases"
            value={data?.highRiskCases ?? '-'}
            colorClass={{ text: 'text-[#be123c]', hoverBorder: 'hover:border-[#be123c]' }}
          />
          <StatCard
            title="Critical (SOS)"
            value={data?.criticalCases ?? '-'}
            colorClass={{ text: 'text-[#be123c]', hoverBorder: 'hover:border-[#be123c]' }}
          />
          <StatCard
            title="Predicted Escalations"
            value={data?.predictedEscalations ?? '-'}
            colorClass={{ text: 'text-[#ea580c]', hoverBorder: 'hover:border-[#ea580c]' }}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <div className="lg:col-span-2 grid grid-cols-2 gap-4">
            <StatCard
              title="Open Protection Referrals"
              value={data?.openProtectionReferrals ?? '-'}
              colorClass={{ text: 'text-[#7e22ce]', hoverBorder: 'hover:border-[#7e22ce]' }}
            />
            <StatCard
              title="Compensation Pending"
              value={data?.compensationPendingCount ?? '-'}
              colorClass={{ text: 'text-[#b45309]', hoverBorder: 'hover:border-[#b45309]' }}
            />
          </div>
        </div>

        {/* Main Cases Table Area */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm flex flex-col w-full mt-4">
          <div className="flex items-center justify-between px-6 py-4">
            <h3 className="font-extrabold text-[16px] text-[#1a2b4b]">Cases</h3>
            <button
              onClick={handleGenerateReport}
              disabled={exportReport.loading || !jurisdictionId}
              className="px-4 py-2 bg-[#2a77c8] hover:bg-[#2363a8] text-white rounded-md text-[13px] font-semibold shadow-sm transition disabled:opacity-60 flex items-center gap-2"
            >
              <FileDown size={16} />
              {exportReport.loading ? 'Downloading...' : 'Download CSV Report'}
            </button>
          </div>
          
          {reportStatus && (
            <div className="px-6 py-2 bg-emerald-50 text-xs font-medium text-emerald-700 border-t border-emerald-100">
              {reportStatus}
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#f8fafc] text-gray-500 text-[10px] uppercase tracking-wider font-bold">
                  <th className="py-3 px-6 rounded-tl-lg">User ID</th>
                  <th className="py-3 px-4">Case Stage</th>
                  <th className="py-3 px-4">Score</th>
                  <th className="py-3 px-4">Risk</th>
                  <th className="py-3 px-6 text-right rounded-tr-lg">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-[13px]">
                {jurisdictionLoading || loading ? (
                  <tr><td colSpan={5} className="py-8 text-center text-gray-400 font-medium">Loading cases...</td></tr>
                ) : error ? (
                  <tr><td colSpan={5} className="py-8 text-center text-rose-600 font-medium">{error}</td></tr>
                ) : (data?.cases || []).length === 0 ? (
                  <tr><td colSpan={5} className="py-8 text-center text-gray-400 font-medium">No cases in this district yet.</td></tr>
                ) : data.cases.map((item) => (
                  <tr key={item.userId} className="hover:bg-gray-50 transition-colors">
                    <td className="py-4 px-6 font-bold text-gray-800">Case {item.userId.slice(0, 8)}</td>
                    <td className="py-4 px-4 text-gray-600 font-medium">{item.caseStage || '-'}</td>
                    <td className="py-4 px-4 font-bold text-gray-800">{item.score ?? '-'}</td>
                    <td className="py-4 px-4">
                      {item.riskLevel ? (
                        <span className={`px-2.5 py-1 rounded text-[11px] font-bold ${RISK_BADGE[item.riskLevel] || 'bg-gray-100 text-gray-600'}`}>
                          {item.riskLevel}
                        </span>
                      ) : <span className="text-gray-400">-</span>}
                    </td>
                    <td className="py-4 px-6 text-right">
                      <button
                        onClick={() => navigate(`/districtadmin/case-detail/${item.userId}`)}
                        className="px-4 py-1.5 border border-[#2a77c8] text-[#2a77c8] hover:bg-blue-50 rounded text-xs font-semibold transition-colors"
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

        {/* Bottom Panels */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
          <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-extrabold text-[15px] text-[#1a2b4b]">Alerts</h3>
            </div>
            {openAlerts.length === 0 ? (
              <p className="text-[13px] text-gray-400 text-center py-6">No open alerts.</p>
            ) : (
              <div className="space-y-4">
                {openAlerts.map((a) => (
                  <div key={a.alertId} className="flex items-center justify-between pb-3 border-b border-gray-50 last:border-0 last:pb-0">
                    <span className="text-[13px] font-medium text-gray-600">Case {String(a.userId).slice(0, 8)}</span>
                    <span className={`px-2.5 py-1 rounded text-[10px] font-bold ${STATUS_BADGE[a.status] || 'bg-gray-100 text-gray-600'}`}>
                      {a.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-extrabold text-[15px] text-[#1a2b4b]">Distress Trend</h3>
            </div>
            {trend.length === 0 ? (
              <p className="text-[13px] text-gray-400 text-center py-4">Not enough data yet.</p>
            ) : (
              <div className="space-y-5">
                {trend.slice(0, 4).map((t, idx) => (
                  <div key={t.period} className="flex items-center gap-4">
                    <span className="w-16 text-[12px] text-gray-600 font-medium shrink-0 truncate">{t.period.split(' - ')[0]} -</span>
                    <div className="flex-1 h-2.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-[#2a77c8] rounded-full" style={{ width: `${Math.min(100, t.avgScore)}%` }} />
                    </div>
                    <span className="font-bold text-gray-800 text-[13px] w-8 text-right shrink-0">{t.avgScore}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </StaffLayout>
  );
}
