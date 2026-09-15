import React, { useEffect, useRef, useState } from 'react';
import { Bell } from 'lucide-react';
import { useMe, useMyNotifications } from '../services/hooks';

// District Admin's own copy of the notification bell - real GET
// /api/me/notifications data, same as every other role's copy.
// alert_notifications targets the assigned Counsellor + every District
// Administration official in the user's jurisdiction for a distress-score
// alert, and District Administration for SOS too - so this role DOES receive
// real alerts.
export default function NotificationBell() {
  const { data: me } = useMe();
  const { data, loading, refetch } = useMyNotifications();
  const notifications = data?.notifications || [];
  const [open, setOpen] = useState(false);
  const [lastSeen, setLastSeen] = useState(0);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => refetch(), 15000);
    return () => clearInterval(interval);
  }, [refetch]);
  const containerRef = useRef(null);
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

  const maxTimestamp = notifications.reduce((max, n) => {
    const t = new Date(n.notifiedAt).getTime();
    return !isNaN(t) && t > max ? t : max;
  }, 0);

  useEffect(() => {
    if (notifications.some((n) => new Date(n.notifiedAt).getTime() > lastSeen)) {
      setDismissed(false);
    }
  }, [notifications, lastSeen]);

  // Once touched/clicked, red dot is immediately cleared
  const unreadCount = (open || dismissed)
    ? 0
    : notifications.filter((n) => new Date(n.notifiedAt).getTime() > lastSeen).length;

  const toggleOpen = () => {
    const next = !open;
    setOpen(next);
    setDismissed(true);
    const targetSeen = Math.max(Date.now(), maxTimestamp);
    setLastSeen(targetSeen);
    if (storageKey) {
      try {
        localStorage.setItem(storageKey, String(targetSeen));
      } catch {
        // best-effort only
      }
    }
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
                <div key={n.notificationId} className="px-4 py-3">
                  <p className="text-xs text-gray-800 font-medium">{n.message}</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">
                    {new Date(n.notifiedAt).toLocaleString()}
                    {n.priority === 'urgent' && <span className="ml-2 text-rose-600 font-bold uppercase">Urgent</span>}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
