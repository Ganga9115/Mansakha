import React from 'react';
import { useNavigate } from 'react-router-dom';
import StaffLayout from '../layouts/StaffLayout';
import { useCounsellorDashboard, useCounsellorAlerts, useScheduledSessions } from '../services/hooks';
import { Calendar } from 'lucide-react';

const STATUS_STYLE = {
  Open: 'bg-rose-50 text-rose-500 border border-rose-100',
  Acknowledged: 'bg-amber-50 text-amber-600 border border-amber-100',
  Resolved: 'bg-emerald-50 text-emerald-600 border border-emerald-100',
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
  const { data: scheduledData, loading: scheduledLoading } = useScheduledSessions();

  const openAlertCount = alertsData?.openCount ?? (alertsData?.alerts || []).filter((a) => a.status === 'Open').length;

  return (
    <StaffLayout title="Counsellor Dashboard">
      <div className="space-y-4 bg-[#f8fafc] p-3 min-h-screen">

        {countsError && (
          <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm px-4 py-3 rounded-xl">{countsError}</div>
        )}

        {/* METRIC CARDS GRID */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
          <MetricCard
            label="TOTAL CASES"
            count={countsLoading ? '...' : counts?.total ?? 0}
            hint="All active cases assigned to you"
          />
          <MetricCard 
            label="LOW RISK" 
            count={countsLoading ? '...' : counts?.low ?? 0} 
          />
          <MetricCard 
            label="MODERATE RISK" 
            count={countsLoading ? '...' : counts?.moderate ?? 0} 
          />
          <MetricCard 
            label="HIGH RISK" 
            count={countsLoading ? '...' : counts?.high ?? 0} 
          />
          <MetricCard 
            label="CRITICAL" 
            count={countsLoading ? '...' : counts?.critical ?? 0} 
          />
          <MetricCard 
            label="OPEN ALERTS" 
            count={alertsLoading ? '...' : openAlertCount} 
          />
          <MetricCard
            label="PREDICTED ESCALATIONS"
            count={countsLoading ? '...' : counts?.predictedEscalations ?? 0}
            hint="Trending toward a higher risk tier within 14 days"
            className="col-span-2 sm:col-span-1"
          />
        </div>

        {/* RECENT ALERTS SECTION */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-xs p-5">
          <div className="flex justify-between items-start mb-6">
            <div>
              <h3 className="font-bold text-gray-900 text-base">Recent Alerts</h3>
              <p className="text-xs text-gray-400 mt-0.5">Latest alerts that need your attention</p>
            </div>
            <button 
              onClick={() => navigate('/counsellor/alerts')} 
              className="px-3.5 py-1.5 text-xs font-semibold text-blue-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors shadow-xs cursor-pointer"
            >
              View All Alerts
            </button>
          </div>

          {alertsLoading ? (
            <p className="text-xs text-gray-400 py-4">Loading...</p>
          ) : (alertsData?.alerts || []).length === 0 ? (
            <p className="text-xs text-gray-400 py-4">No alerts yet.</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {(alertsData.alerts || []).slice(0, 6).map((a) => (
                <div 
                  key={a.alertId} 
                  className="py-3.5 flex items-center justify-between"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-gray-900 text-sm">
                      Case {a.userId.slice(0, 8)}
                    </span>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${STATUS_STYLE[a.status] || 'bg-gray-100 text-gray-600'}`}>
                      {a.status}
                    </span>
                    <span className="text-xs text-gray-400 font-medium text-right min-w-[40px]">
                      {timeAgo(a.triggeredAt)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* SCHEDULED COUNSELLINGS SECTION */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-xs p-5">
          <div className="mb-5">
            <h3 className="font-bold text-gray-900 text-base">Scheduled Counsellings</h3>
            <p className="text-xs text-gray-400 mt-0.5">Manage your upcoming counselling sessions</p>
          </div>

          {scheduledLoading ? (
            <p className="text-xs text-gray-400 py-4">Loading...</p>
          ) : (scheduledData?.sessions || []).length === 0 ? (
            <div className="flex items-center gap-4 py-2">
              <div className="p-3 bg-blue-50/70 rounded-2xl flex items-center justify-center">
                <Calendar className="w-6 h-6 text-blue-500" />
              </div>
              <p className="text-xs text-gray-400 font-medium">No upcoming sessions.</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {scheduledData.sessions.map((s) => (
                <div key={s.sessionId} className="py-3.5 flex items-center justify-between text-xs">
                  <span className="font-bold text-gray-800 text-sm">Case {s.userId.slice(0, 8)}</span>
                  <span className="text-gray-500 font-medium">{new Date(s.scheduledAt).toLocaleString()}</span>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </StaffLayout>
  );
}

function MetricCard({ label, count, hint, className = '' }) {
  return (
    <div className={`bg-white p-4 rounded-2xl border border-gray-100 shadow-xs flex flex-col justify-center items-center text-center ${className}`} title={hint}>
      <span className="text-[10px] font-bold text-gray-500 tracking-wider uppercase max-w-[100px] leading-snug mb-2">
        {label}
      </span>
      <div className="text-2xl font-black text-gray-900">{count}</div>
    </div>
  );
}