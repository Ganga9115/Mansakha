import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, X, ExternalLink, Phone, AlertTriangle } from 'lucide-react';
import { useMe, useMyNotifications } from '../services/hooks';

// GET /api/me/notifications (unlike /api/counsellor/alerts) returns all four
// alert_notifications.source values, not just distress_score/sos - the modal
// title used to be a plain source==='sos' ternary, so a disengagement or
// weekly_review notification (both real, both routed here) always showed
// "Risk Alert" even though neither is a distress-score alert.
const SOURCE_LABELS = {
  sos: 'Urgent Help Request',
  distress_score: 'Risk Alert',
  disengagement: 'Disengagement Alert',
  weekly_review: 'Weekly Review',
};

// Counsellor's own copy of the notification bell (real GET /api/me/notifications
// data, not decorative) - every role gets its own copy per the no-shared-
// imports rule, even though the implementation is identical across roles.
export default function NotificationBell() {
  const navigate = useNavigate();
  const { data: me } = useMe();
  const { data, loading, refetch } = useMyNotifications();
  const notifications = data?.notifications || [];
  const [open, setOpen] = useState(false);
  const [lastSeen, setLastSeen] = useState(0);
  // The notification the detail modal is showing, or null when closed. Kept
  // separate from `open` (the dropdown) so opening a detail view doesn't
  // have to also tear down the list behind it.
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    const interval = setInterval(() => refetch(), 15000);
    return () => clearInterval(interval);
  }, [refetch]);
  const containerRef = useRef(null);
  // Keyed by officialId, not a shared key - otherwise one account's "seen"
  // timestamp would wrongly suppress another account's unread badge the
  // next time someone logs into a different account on the same browser.
  const storageKey = me?.officialId ? `mansakha_notifications_last_seen_${me.officialId}` : null;

  useEffect(() => {
    if (!storageKey) return;
    try {
      const stored = localStorage.getItem(storageKey);
      setLastSeen(stored ? Number(stored) : 0);
    } catch {
      // localStorage unavailable - badge just won't persist across reloads
    }
  }, [storageKey]);

  useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const unreadCount = notifications.filter((n) => new Date(n.notifiedAt).getTime() > lastSeen).length;

  const toggleOpen = () => {
    const next = !open;
    setOpen(next);
    if (next) {
      const now = Date.now();
      setLastSeen(now);
      if (storageKey) {
        try {
          localStorage.setItem(storageKey, String(now));
        } catch {
          // best-effort only
        }
      }
    }
  };

  const handleViewCase = () => {
    if (!selected?.userId) return;
    setSelected(null);
    setOpen(false);
    navigate(`/counsellor/case-detail/${selected.userId}`);
  };

  return (
    <div className="relative" ref={containerRef}>
      <button onClick={toggleOpen} className="relative p-1 text-[#3D5A80] hover:opacity-70">
        <Bell size={20} />
        {unreadCount > 0 && (
          <span className="absolute top-0 right-0 h-2 w-2 bg-red-500 rounded-full"></span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-xl border border-gray-200 shadow-lg z-20 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <h4 className="text-xs font-bold text-gray-800 uppercase tracking-wide">Notifications</h4>
          </div>
          <div className="max-h-80 overflow-y-auto divide-y divide-gray-100">
            {loading ? (
              <p className="px-4 py-6 text-xs text-gray-400 text-center">Loading...</p>
            ) : notifications.length === 0 ? (
              <p className="px-4 py-6 text-xs text-gray-400 text-center">No notifications yet.</p>
            ) : (
              notifications.map((n) => (
                // Each row is now clickable into a detail view (who, what
                // kind of alert, when, current status) with real next-step
                // actions - previously this was just static text with no
                // way to see more or act on it.
                <button
                  key={n.notificationId}
                  onClick={() => setSelected(n)}
                  className="w-full text-left px-4 py-3 hover:bg-gray-50 transition"
                >
                  <p className="text-xs text-gray-800 font-medium">{n.message}</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">
                    {new Date(n.notifiedAt).toLocaleString()}
                    {n.priority === 'urgent' && <span className="ml-2 text-rose-600 font-bold uppercase">Urgent</span>}
                  </p>
                </button>
              ))
            )}
          </div>
        </div>
      )}

      {/* Notification detail - a modal rather than a dedicated route, since
          this opens out of a dropdown panel and a modal keeps the counsellor
          on the same page. Backdrop click and the X both just close the
          detail view, not the whole dropdown behind it. */}
      {selected && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setSelected(null)}
        >
          <div
            className="bg-white rounded-xl shadow-xl w-full max-w-md p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-2">
                {selected.priority === 'urgent' && <AlertTriangle size={18} className="text-rose-600 shrink-0" />}
                <h3 className="text-lg font-bold text-gray-800">
                  {SOURCE_LABELS[selected.source] || 'Risk Alert'}
                </h3>
              </div>
              <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600 shrink-0" aria-label="Close">
                <X size={18} />
              </button>
            </div>

            <dl className="space-y-2 text-sm text-gray-700 mb-6">
              <div className="flex justify-between gap-4">
                <dt className="text-gray-400">User</dt>
                <dd className="font-medium text-gray-800 text-right">{selected.userName || 'Unknown'}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-gray-400">Priority</dt>
                <dd className={`font-medium text-right capitalize ${selected.priority === 'urgent' ? 'text-rose-600' : 'text-gray-800'}`}>
                  {selected.priority || 'normal'}
                </dd>
              </div>
              {selected.riskLevel && (
                <div className="flex justify-between gap-4">
                  <dt className="text-gray-400">Risk Level</dt>
                  <dd className="font-medium text-gray-800 text-right">{selected.riskLevel}</dd>
                </div>
              )}
              {selected.scoreValue !== null && selected.scoreValue !== undefined && (
                <div className="flex justify-between gap-4">
                  <dt className="text-gray-400">Distress Score</dt>
                  <dd className="font-medium text-gray-800 text-right">{selected.scoreValue}</dd>
                </div>
              )}
              <div className="flex justify-between gap-4">
                <dt className="text-gray-400">Status</dt>
                <dd className="font-medium text-gray-800 text-right">{selected.status || 'Open'}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-gray-400">Occurred</dt>
                <dd className="font-medium text-gray-800 text-right">
                  {selected.triggeredAt ? new Date(selected.triggeredAt).toLocaleString() : 'Unknown'}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-gray-400">Notified</dt>
                <dd className="font-medium text-gray-800 text-right">
                  {selected.notifiedAt ? new Date(selected.notifiedAt).toLocaleString() : 'Unknown'}
                </dd>
              </div>
            </dl>

            <div className="flex flex-wrap gap-3">
              <button
                onClick={handleViewCase}
                className="flex-1 min-w-[140px] flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white bg-[#3D5A80] hover:bg-[#31496a] transition"
              >
                <ExternalLink size={16} /> View Case
              </button>
              {selected.userPhone && (
                <a
                  href={`tel:${selected.userPhone}`}
                  className="flex-1 min-w-[140px] flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-rose-600 border border-rose-200 hover:bg-rose-50 transition"
                >
                  <Phone size={16} /> Call {selected.userName || 'user'}
                </a>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
