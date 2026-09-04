import React from 'react';
import { useNavigate } from 'react-router-dom';
import StaffLayout from '../layouts/StaffLayout';
import { useCounsellorDashboard, useCounsellorAlerts, useScheduledSessions } from '../services/hooks';
import { 
  FileText, 
  ShieldCheck, 
  AlertTriangle, 
  Flame, 
  AlertCircle, 
  MessageSquare, 
  TrendingUp, 
  Bell, 
  Calendar 
} from 'lucide-react';

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
      <div className="space-y-6 bg-[#f8fafc] p-2 min-h-screen">

        {countsError && (
          <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm px-4 py-3 rounded-xl">{countsError}</div>
        )}

        {/* METRIC CARDS ROW */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
          <MetricCard
            label="TOTAL CASES"
            count={countsLoading ? '...' : counts?.total ?? 0}
            icon={<FileText className="w-4 h-4 text-blue-500" />}
            iconBg="bg-blue-50"
            hint="All active cases assigned to you"
          />
          <MetricCard 
            label="LOW RISK" 
            count={countsLoading ? '...' : counts?.low ?? 0} 
            icon={<ShieldCheck className="w-4 h-4 text-emerald-500" />}
            iconBg="bg-emerald-50"
          />
          <MetricCard 
            label="MODERATE RISK" 
            count={countsLoading ? '...' : counts?.moderate ?? 0} 
            icon={<AlertTriangle className="w-4 h-4 text-amber-500" />}
            iconBg="bg-amber-50"
          />
          <MetricCard 
            label="HIGH RISK" 
            count={countsLoading ? '...' : counts?.high ?? 0} 
            icon={<Flame className="w-4 h-4 text-rose-500" />}
            iconBg="bg-rose-50"
          />
          <MetricCard 
            label="CRITICAL" 
            count={countsLoading ? '...' : counts?.critical ?? 0} 
            icon={<AlertCircle className="w-4 h-4 text-purple-600" />}
            iconBg="bg-purple-50"
          />
          <MetricCard 
            label="OPEN ALERTS" 
            count={alertsLoading ? '...' : openAlertCount} 
            icon={<MessageSquare className="w-4 h-4 text-sky-500" />}
            iconBg="bg-sky-50"
          />
          <MetricCard
            label="PREDICTED ESCALATIONS"
            count={countsLoading ? '...' : counts?.predictedEscalations ?? 0}
            icon={<TrendingUp className="w-4 h-4 text-amber-500" />}
            iconBg="bg-amber-50"
            hint="Trending toward a higher risk tier within 14 days"
          />
        </div>

        {/* RECENT ALERTS SECTION */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <div className="flex justify-between items-start mb-6">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-blue-50 rounded-xl text-blue-600">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-gray-900 text-base">Recent Alerts</h3>
                <p className="text-xs text-gray-400 mt-0.5">Latest alerts that need your attention</p>
              </div>
            </div>
            <button 
              onClick={() => navigate('/counsellor/alerts')} 
              className="px-4 py-2 text-xs font-semibold text-blue-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors flex items-center gap-1 shadow-xs cursor-pointer"
            >
              View All Alerts
            </button>
          </div>

          {alertsLoading ? (
            <p className="text-xs text-gray-400 py-4">Loading...</p>
          ) : (alertsData?.alerts || []).length === 0 ? (
            <p className="text-xs text-gray-400 py-4">No alerts yet.</p>
          ) : (
            <div className="divide-y divide-gray-50">
              {(alertsData.alerts || []).slice(0, 6).map((a) => (
                <div 
                  key={a.alertId} 
                  className="py-4 flex items-center justify-between px-2"
                >
                  <div className="flex items-center gap-4">
                    <div className="p-2.5 bg-rose-50 text-rose-500 rounded-xl border border-rose-100/50">
                      <Bell className="w-4 h-4" />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-gray-900 text-sm">
                        Case {a.userId.slice(0, 8)}
                      </span>
                      {a.source === 'sos' && (
                        <span className="px-1.5 py-0.5 rounded-md bg-rose-100 text-rose-600 text-[10px] font-bold uppercase tracking-wider">
                          sos
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <span className={`px-3 py-1 rounded-full text-xs font-semibold ${STATUS_STYLE[a.status] || 'bg-gray-100 text-gray-600'}`}>
                      {a.status}
                    </span>
                    <span className="text-xs text-gray-400 font-medium w-16 text-right">
                      {timeAgo(a.triggeredAt)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* SCHEDULED COUNSELLINGS SECTION */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <div className="mb-6">
            <h3 className="font-bold text-gray-900 text-base">Scheduled Counsellings</h3>
            <p className="text-xs text-gray-400 mt-0.5">Manage your upcoming counselling sessions</p>
          </div>

          {scheduledLoading ? (
            <p className="text-xs text-gray-400 py-4">Loading...</p>
          ) : (scheduledData?.sessions || []).length === 0 ? (
            <div className="flex items-center gap-4 py-4">
              <div className="p-3 bg-blue-50/60 rounded-2xl">
                <Calendar className="w-8 h-8 text-blue-400" />
              </div>
              <p className="text-xs text-gray-400 font-medium">No upcoming sessions.</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {scheduledData.sessions.map((s) => (
                <div key={s.sessionId} className="py-3.5 flex items-center justify-between text-xs px-2">
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

function MetricCard({ label, count, icon, iconBg, hint }) {
  return (
    <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex flex-col justify-between" title={hint}>
      <div>
        <div className="flex items-center gap-2 mb-3">
          <div className={`p-1.5 rounded-lg ${iconBg}`}>
            {icon}
          </div>
          <span className="text-[10px] font-bold text-gray-500 tracking-wider uppercase">{label}</span>
        </div>
        <div className="text-2xl font-black text-gray-900">{count}</div>
      </div>
    </div>
  );
}