import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import StaffLayout from '../layouts/StaffLayout';
import { ArrowUpRight, ArrowDownRight, Minus, FileDown } from 'lucide-react';
import { useAdminDashboard, useExportReportCsv } from '../services/hooks';

const TREND_META = {
  up: { icon: ArrowUpRight, color: 'text-red-600', label: 'Rising' },
  down: { icon: ArrowDownRight, color: 'text-emerald-600', label: 'Falling' },
  flat: { icon: Minus, color: 'text-gray-400', label: 'Flat' },
};

function StatCard({ title, value, tone }) {
  return (
    <div className="bg-white p-5 rounded-xl border border-gray-200/80 shadow-sm space-y-1">
      <span className="text-[10px] font-bold tracking-wider text-gray-400 uppercase block">{title}</span>
      <span className={`text-2xl font-bold block ${tone || 'text-gray-800'}`}>{value}</span>
    </div>
  );
}

// National Admin's own copy of the state drill-down view - reached via
// /nationaladmin/state/:jurisdictionId from NationalDashboard.jsx's "Drill
// Down" button. Same district-wise breakdown State Admin's own StateDashboard
// shows for its own state, just reached as a specific child (always resolved
// from the URL param here, never from the caller's own jurisdiction) - and
// itself drills further into a district (AdminDashboard, also in this folder).
export default function StateDashboard() {
  const navigate = useNavigate();
  const { jurisdictionId } = useParams();
  const { data, loading, error } = useAdminDashboard(jurisdictionId);
  const exportReport = useExportReportCsv();
  const [reportStatus, setReportStatus] = useState(null);

  const districts = data?.trends || [];

  const handleGenerateReport = async () => {
    setReportStatus(null);
    try {
      await exportReport.mutate(jurisdictionId, 'state_report');
      setReportStatus('Report downloaded successfully.');
    } catch (err) {
      setReportStatus(err.message || 'Could not download report.');
    }
  };

  return (
    <StaffLayout title="State Dashboard">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 flex-1 mr-6">
            <StatCard title="Total Cases (Statewide)" value={data?.totalCases ?? data?.total ?? '-'} />
            <StatCard title="High-Risk Cases" value={data?.highRiskCases ?? data?.highRisk ?? '-'} tone="text-rose-600" />
            <StatCard title="Critical Cases" value={data?.criticalCases ?? data?.critical ?? '-'} tone="text-purple-700" />
            <StatCard title="Predicted Escalations" value={data?.predictedEscalations ?? '-'} tone="text-orange-600" />
          </div>
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

        <div className="bg-white rounded-xl border border-gray-200/80 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h3 className="font-bold text-sm text-gray-800">District-wise Breakdown</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#EBF4FA]/60 text-gray-600 text-[11px] uppercase tracking-wider font-semibold border-b border-gray-100">
                  <th className="py-3 px-6">District</th>
                  <th className="py-3 px-4">Total Cases</th>
                  <th className="py-3 px-4">High-Risk</th>
                  <th className="py-3 px-4">Critical</th>
                  <th className="py-3 px-4">Trend</th>
                  <th className="py-3 px-6 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-xs">
                {loading ? (
                  <tr><td colSpan={6} className="py-8 text-center text-gray-400">Loading...</td></tr>
                ) : error ? (
                  <tr><td colSpan={6} className="py-8 text-center text-rose-600">{error}</td></tr>
                ) : districts.length === 0 ? (
                  <tr><td colSpan={6} className="py-8 text-center text-gray-400">No district data yet.</td></tr>
                ) : districts.map((d) => {
                  const trend = TREND_META[d.trendDirection] || TREND_META.flat;
                  const TrendIcon = trend.icon;
                  return (
                    <tr key={d.jurisdictionId} className="hover:bg-gray-50/70 transition">
                      <td className="py-3.5 px-6 font-bold text-gray-800">{d.name}</td>
                      <td className="py-3.5 px-4 text-gray-700 font-medium">{d.totalCases ?? d.total ?? 0}</td>
                      <td className="py-3.5 px-4 text-rose-600 font-bold">{d.highRiskCases ?? d.highRisk ?? 0}</td>
                      <td className="py-3.5 px-4 text-purple-700 font-bold">{d.criticalCases ?? d.critical ?? 0}</td>
                      <td className="py-3.5 px-4">
                        <span className={`flex items-center gap-1 font-bold ${trend.color}`}>
                          <TrendIcon size={14} /> {trend.label}
                        </span>
                      </td>
                      <td className="py-3.5 px-6 text-right">
                        <button
                          onClick={() => navigate(`/nationaladmin/district/${d.jurisdictionId}`)}
                          className="px-3 py-1.5 border border-[#519BCE] text-[#519BCE] hover:bg-[#519BCE] hover:text-white rounded-md text-xs font-medium transition"
                        >
                          Drill Down
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </StaffLayout>
  );
}
