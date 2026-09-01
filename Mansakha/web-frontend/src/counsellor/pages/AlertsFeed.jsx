import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import StaffLayout from '../layouts/StaffLayout';
import { useToast } from '../../shared/context/ToastContext';
import { useCounsellorAlerts, useResolveSosEvent, useResolveAlert, useAcknowledgeSosEvent, useAcknowledgeAlert } from '../services/hooks';

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

export default function AlertsFeed() {
  const [filter, setFilter] = useState('All');
  const { data, loading, error, refetch } = useCounsellorAlerts();
  const navigate = useNavigate();
  const toast = useToast();
  const resolveSos = useResolveSosEvent();
  const resolveAlert = useResolveAlert();
  const acknowledgeSos = useAcknowledgeSosEvent();
  const acknowledgeAlert = useAcknowledgeAlert();

  const handleResolve = async (item) => {
    try {
      if (item.source === 'sos') {
        await resolveSos.mutate(item.alertId);
      } else {
        await resolveAlert.mutate(item.alertId);
      }
      toast.success('Marked as resolved.');
      refetch();
    } catch (err) {
      toast.error(err.message || 'Could not resolve this alert.');
    }
  };

  const handleAcknowledge = async (item) => {
    try {
      if (item.source === 'sos') {
        await acknowledgeSos.mutate(item.alertId);
      } else {
        await acknowledgeAlert.mutate(item.alertId);
      }
      toast.success('Marked as acknowledged.');
      refetch();
    } catch (err) {
      toast.error(err.message || 'Could not acknowledge this alert.');
    }
  };

  const allAlerts = data?.alerts || [];
  const counts = {
    All: allAlerts.length,
    Open: allAlerts.filter((a) => a.status === 'Open').length,
    Acknowledged: allAlerts.filter((a) => a.status === 'Acknowledged').length,
    Resolved: allAlerts.filter((a) => a.status === 'Resolved').length,
  };
  const alerts = filter === 'All' ? allAlerts : allAlerts.filter((a) => a.status === filter);

  return (
    <StaffLayout title="Alerts Feed">
      <div className="space-y-6">

        {/* FILTER BAR */}
        <div className="inline-flex items-center gap-1 bg-white p-1 rounded-xl border border-gray-200 text-xs">
          {['All', 'Open', 'Acknowledged', 'Resolved'].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg font-medium transition ${filter === f ? 'bg-[#519BCE] text-white' : 'text-gray-600 hover:text-gray-900'}`}
            >
              {f} <span className="ml-1 text-[10px] opacity-75">{counts[f]}</span>
            </button>
          ))}
        </div>

        {error && <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm px-4 py-3 rounded-lg">{error}</div>}

        {/* ALERTS LIST */}
        <div className="space-y-3">
          {loading ? (
            <p className="text-xs text-gray-400">Loading...</p>
          ) : alerts.length === 0 ? (
            <p className="text-xs text-gray-400">No alerts in this view.</p>
          ) : alerts.map((item) => (
            <div
              key={item.alertId}
              className={`bg-white p-4 rounded-xl border transition flex items-center justify-between ${
                item.source === 'sos' || item.priority === 'urgent' ? 'border-l-4 border-l-rose-600 border-y border-r border-gray-200/80 shadow-sm'
                  : item.status === 'Open' ? 'border-[#519BCE]/60 shadow-sm' : 'border-gray-200/80'
              }`}
            >
              <div className="flex items-center gap-4">
                <span className={`w-2 h-2 rounded-full ${item.status === 'Open' ? 'bg-[#519BCE]' : 'bg-transparent'}`}></span>
                <div>
                  <h4 className="font-bold text-sm text-gray-800 flex items-center gap-2">
                    Case {item.userId.slice(0, 8)}
                    {item.source === 'sos' && (
                      <span className="px-1.5 py-0.5 rounded bg-rose-600 text-white text-[9px] font-bold uppercase">SOS</span>
                    )}
                    {item.priority === 'urgent' && item.source !== 'sos' && (
                      <span className="px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 text-[9px] font-bold uppercase">Urgent</span>
                    )}
                  </h4>
                  <p className="text-xs text-gray-500 mt-0.5">Triggered {timeAgo(item.triggeredAt)}</p>
                </div>
              </div>

              <div className="flex items-center gap-6 text-xs">
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${STATUS_STYLE[item.status] || 'bg-gray-100 text-gray-600'}`}>
                  {item.status}
                </span>
                {item.status === 'Open' && (
                  <button
                    onClick={() => handleAcknowledge(item)}
                    disabled={acknowledgeSos.loading || acknowledgeAlert.loading}
                    className="px-3 py-1.5 border border-amber-500 text-amber-600 hover:bg-amber-50 rounded-lg text-xs font-medium transition disabled:opacity-60"
                  >
                    Acknowledge
                  </button>
                )}
                {item.status !== 'Resolved' && (
                  <button
                    onClick={() => handleResolve(item)}
                    disabled={resolveSos.loading || resolveAlert.loading}
                    className="px-3 py-1.5 border border-emerald-500 text-emerald-600 hover:bg-emerald-50 rounded-lg text-xs font-medium transition disabled:opacity-60"
                  >
                    Mark Resolved
                  </button>
                )}
                <button
                  onClick={() => navigate(`/counsellor/case-detail/${item.userId}`)}
                  className="px-3 py-1.5 border border-[#519BCE] text-[#519BCE] hover:bg-[#519BCE]/10 rounded-lg text-xs font-medium transition"
                >
                  Review details
                </button>
              </div>
            </div>
          ))}
        </div>

      </div>
    </StaffLayout>
  );
}
