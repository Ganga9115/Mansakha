import React, { useState } from 'react';
import MinistryLayout from '../layouts/MinistryLayout';
import { Radio } from 'lucide-react';
import { useJurisdictionOptions, useAdminDashboard, useSendBroadcast } from '../services/hooks';
import { useToast } from '../../shared/context/ToastContext';

const JURISDICTION_LEVELS = ['district', 'state', 'national'];

const PRIORITY_OPTIONS = [
  { value: 'normal', label: 'Normal' },
  { value: 'urgent', label: 'Urgent' },
];

// Task 4B - mass SMS+push to every active user in a jurisdiction (and its
// descendant subtree). Genuinely irreversible once queued (messages get
// dispatched), so sending is gated behind an explicit two-step confirm: the
// "Send Broadcast" button only opens a confirmation card showing who this
// reaches; nothing is queued until the second, separate "Confirm & Send"
// click calls useSendBroadcast().mutate.
//
// There's no dedicated "preview recipient count" endpoint on the backend, so
// the confirmation step's count is sourced from the dashboard endpoint (via
// useAdminDashboard) which already returns a `total` user figure for any
// jurisdiction tier. Note this is a same-subtree APPROXIMATION, not an exact
// match - the dashboard's `total` counts every user in the subtree
// regardless of status, while the broadcast route only queues users with
// status='active'. The exact number actually queued comes back from the
// broadcast response itself (`queuedCount`) and is surfaced in the
// post-send toast.
export default function EmergencyBroadcast() {
  const toast = useToast();

  const [jurisdictionLevel, setJurisdictionLevel] = useState('district');
  const [jurisdictionId, setJurisdictionId] = useState('');
  const [priority, setPriority] = useState('normal');
  const [message, setMessage] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);

  const jurisdictionQuery = useJurisdictionOptions(jurisdictionLevel);
  const jurisdictionOptions = jurisdictionQuery.data?.jurisdictions || [];
  const selectedJurisdiction = jurisdictionOptions.find((j) => j.jurisdictionId === jurisdictionId);

  // Fires as soon as a jurisdiction is picked, so the recipient estimate is
  // already loaded by the time the admin reaches the confirm step instead
  // of needing a separate "Preview" click.
  const dashboardQuery = useAdminDashboard(jurisdictionId);
  const estimatedCount = dashboardQuery.data?.total;

  const sendBroadcast = useSendBroadcast();

  // Any edit after the confirmation card is showing collapses back to the
  // editing state - a stale confirmation for a message/jurisdiction the
  // admin has since changed would defeat the point of confirming at all.
  const withCollapse = (setter) => (value) => {
    setShowConfirm(false);
    setter(value);
  };
  const handleLevelChange = (level) => {
    setShowConfirm(false);
    setJurisdictionLevel(level);
    setJurisdictionId('');
  };
  const handleJurisdictionChange = withCollapse(setJurisdictionId);
  const handlePriorityChange = withCollapse(setPriority);
  const handleMessageChange = withCollapse(setMessage);

  const canSend = jurisdictionId && message.trim().length > 0;

  const handleOpenConfirm = (e) => {
    e.preventDefault();
    if (!canSend) return;
    setShowConfirm(true);
  };

  const handleCancelConfirm = () => setShowConfirm(false);

  const handleConfirmSend = async () => {
    try {
      const result = await sendBroadcast.mutate({
        jurisdictionId,
        message: message.trim(),
        priority,
      });
      toast.success(`Broadcast queued for ${result?.queuedCount ?? 0} user(s) in ${selectedJurisdiction?.name || 'the selected jurisdiction'}.`);
      setShowConfirm(false);
      setMessage('');
    } catch (err) {
      toast.error(err.message || 'Could not send this broadcast.');
    }
  };

  return (
    <MinistryLayout title="Broadcast">
      <div className="max-w-2xl space-y-6">
        <form onSubmit={handleOpenConfirm} className="bg-white rounded-xl border border-gray-200/80 shadow-sm p-6 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-[11px] font-bold text-gray-500 uppercase block mb-1">Jurisdiction Level</label>
              <select
                value={jurisdictionLevel}
                onChange={(e) => handleLevelChange(e.target.value)}
                disabled={sendBroadcast.loading}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white disabled:opacity-60"
              >
                {JURISDICTION_LEVELS.map((l) => <option key={l} value={l} className="capitalize">{l}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[11px] font-bold text-gray-500 uppercase block mb-1">Jurisdiction</label>
              <select
                value={jurisdictionId}
                onChange={(e) => handleJurisdictionChange(e.target.value)}
                disabled={sendBroadcast.loading}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white disabled:opacity-60"
              >
                <option value="">Select...</option>
                {jurisdictionOptions.map((j) => <option key={j.jurisdictionId} value={j.jurisdictionId}>{j.name}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="text-[11px] font-bold text-gray-500 uppercase block mb-2">Priority</label>
            <div className="flex gap-2">
              {PRIORITY_OPTIONS.map((opt) => (
                <label
                  key={opt.value}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold border cursor-pointer transition ${
                    priority === opt.value
                      ? opt.value === 'urgent'
                        ? 'bg-rose-600 border-rose-600 text-white'
                        : 'bg-[#519BCE] border-[#519BCE] text-white'
                      : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <input
                    type="radio"
                    name="priority"
                    value={opt.value}
                    checked={priority === opt.value}
                    onChange={(e) => handlePriorityChange(e.target.value)}
                    disabled={sendBroadcast.loading}
                    className="sr-only"
                  />
                  {opt.label}
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="text-[11px] font-bold text-gray-500 uppercase block mb-1">Message</label>
            <textarea
              value={message}
              onChange={(e) => handleMessageChange(e.target.value)}
              disabled={sendBroadcast.loading}
              rows={6}
              placeholder="Type the broadcast message every active user in this jurisdiction will receive..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm disabled:opacity-60 resize-none"
            />
          </div>

          {!showConfirm && (
            <button
              type="submit"
              disabled={!canSend || sendBroadcast.loading}
              className="flex items-center gap-2 px-4 py-2.5 bg-[#519BCE] hover:bg-[#3d83b3] text-white rounded-lg text-sm font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Radio size={15} />
              Send Broadcast
            </button>
          )}
        </form>

        {showConfirm && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 space-y-4">
            <div className="flex items-start gap-3">
              <div>
                <p className="text-sm font-bold text-gray-900">
                  Ready to send broadcast to {estimatedCount ?? (dashboardQuery.loading ? '...' : 0)} recipient(s) in {selectedJurisdiction?.name || 'the selected jurisdiction'}.
                </p>
                <p className="text-xs text-gray-600 mt-1">
                  Priority: <span className="font-semibold capitalize">{priority}</span>.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={handleConfirmSend}
                disabled={sendBroadcast.loading}
                className="px-4 py-2 bg-[#519BCE] hover:bg-[#3d83b3] text-white rounded-lg text-xs font-bold transition disabled:opacity-60"
              >
                {sendBroadcast.loading ? 'Sending...' : 'Confirm & Send'}
              </button>
              <button
                onClick={handleCancelConfirm}
                disabled={sendBroadcast.loading}
                className="px-4 py-2 border border-gray-300 text-gray-600 hover:bg-gray-50 rounded-lg text-xs font-semibold transition disabled:opacity-60"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </MinistryLayout>
  );
}
