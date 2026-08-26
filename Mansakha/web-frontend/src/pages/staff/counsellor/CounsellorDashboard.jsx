import React from 'react';
import { useNavigate } from 'react-router-dom';
import StaffLayout from '../../../layouts/StaffLayout';
import { useCounsellorDashboard, useCounsellorAlerts } from '../../../services/hooks';

const STATUS_STYLE = {
  Open: 'bg-rose-100 text-rose-700',
  Acknowledged: 'bg-amber-100 text-amber-700',
  Resolved: 'bg-emerald-100 text-emerald-700',
};

function timeAgo(iso) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function CounsellorDashboard() {
  const navigate = useNavigate();
  const { data: counts, loading: countsLoading, error: countsError } = useCounsellorDashboard();
  const { data: alertsData, loading: alertsLoading } = useCounsellorAlerts();
  const openAlertCount = (alertsData?.alerts || []).filter((a) => a.status === 'Open').length;

  return (
    <StaffLayout title="Counsellor Dashboard">
      <div className="space-y-6">

        {countsError && (
          <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm px-4 py-3 rounded-lg">{countsError}</div>
        )}

        {/* METRIC CARDS ROW */}
        <div className="grid grid-cols-6 gap-4">
          <MetricCard label="TOTAL CASES" count={countsLoading ? '...' : counts?.total ?? 0} dotColor="bg-slate-600" />
          <MetricCard label="LOW RISK" count={countsLoading ? '...' : counts?.low ?? 0} dotColor="bg-emerald-500" />
          <MetricCard label="MODERATE RISK" count={countsLoading ? '...' : counts?.moderate ?? 0} dotColor="bg-amber-500" />
          <MetricCard label="HIGH RISK" count={countsLoading ? '...' : counts?.high ?? 0} dotColor="bg-rose-500" />
          <MetricCard label="CRITICAL" count={countsLoading ? '...' : counts?.critical ?? 0} dotColor="bg-purple-600" />
          <MetricCard label="OPEN ALERTS" count={alertsLoading ? '...' : openAlertCount} dotColor="bg-[#519BCE]" />
        </div>

        {/* RECENT ALERTS */}
        <div className="bg-white p-6 rounded-lg border border-gray-100 shadow-sm">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-bold text-sm text-gray-800">Recent Alerts</h3>
            <button onClick={() => navigate('/counsellor/alerts')} className="text-xs text-[#519BCE] font-medium hover:underline">
              View All
            </button>
          </div>
          {alertsLoading ? (
            <p className="text-xs text-gray-400">Loading...</p>
          ) : (alertsData?.alerts || []).length === 0 ? (
            <p className="text-xs text-gray-400">No alerts yet.</p>
          ) : (
            <div className="divide-y divide-gray-50">
              {(alertsData.alerts || []).slice(0, 6).map((a) => (
                <div key={a.alertId} className="py-3 flex items-center justify-between text-xs">
                  <span className="font-bold text-gray-800">Case {a.victimId.slice(0, 8)}</span>
                  <div className="flex items-center gap-3">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${STATUS_STYLE[a.status] || 'bg-gray-100 text-gray-600'}`}>
                      {a.status}
                    </span>
                    <span className="text-gray-400 w-16 text-right">{timeAgo(a.triggeredAt)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </StaffLayout>
  );
}

function MetricCard({ label, count, dotColor }) {
  return (
    <div className="bg-white p-4 rounded-lg border border-gray-100 shadow-sm flex flex-col justify-between">
      <div className="flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${dotColor}`}></span>
        <span className="text-[10px] font-bold text-gray-500 tracking-wider">{label}</span>
      </div>
      <span className="text-3xl font-bold text-gray-800 mt-3">{count}</span>
    </div>
  );
}
