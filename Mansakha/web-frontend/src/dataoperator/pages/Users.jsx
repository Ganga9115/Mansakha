import React, { useState } from 'react';
import StaffLayout from '../layouts/StaffLayout';
import { Trash2, Link2, X } from 'lucide-react';
import { useDataOperatorUsers, useUpdateDataOperatorUser, useDeleteDataOperatorUser, useLinkExistingCase } from '../services/hooks';
import PersonSearchPicker from '../components/PersonSearchPicker';

// 'Case Closed' is a terminal stage settable only by Data Operator (this
// screen) - District Admin's equivalent editor stays restricted to the
// original 4 (user/services/userProvisioning.js enforces this server-side).
const CASE_STAGE_OPTIONS = ['Investigation', 'Trial', 'Rehabilitation', 'Compensation', 'Case Closed'];

// A real switch (track + sliding knob) instead of a colored badge that
// happened to be clickable - the status toggle already worked correctly
// (handleStatusToggle below), it just looked like a static label with no
// visual affordance that clicking it does anything.
function StatusToggle({ status, onToggle, disabled }) {
  const isActive = status === 'active';
  return (
    <button
      type="button"
      role="switch"
      aria-checked={isActive}
      onClick={onToggle}
      disabled={disabled}
      className={`inline-flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed group`}
      title={isActive ? 'Active - click to mark inactive' : 'Inactive - click to mark active'}
    >
      <span
        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
          isActive ? 'bg-emerald-500' : 'bg-gray-300'
        }`}
      >
        <span
          className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
            isActive ? 'translate-x-[18px]' : 'translate-x-[3px]'
          }`}
        />
      </span>
      <span className={`text-[10px] font-bold ${isActive ? 'text-emerald-700' : 'text-gray-500'}`}>
        {isActive ? 'Active' : 'Inactive'}
      </span>
    </button>
  );
}

// Feature Catalog Section 7 extension (explicit user request) - every user
// this Data Operator flow has registered, with full detail and the
// ability to update case stage/status or delete a mistaken entry. Delete
// only actually succeeds server-side for a user with no case history yet
// (see user/services/userProvisioning.js's deleteUser) - the error message
// from a blocked delete is surfaced as-is, suggesting "mark inactive" instead.
export default function Users() {
  const { data, loading, error, refetch } = useDataOperatorUsers();
  const updateUser = useUpdateDataOperatorUser();
  const deleteUser = useDeleteDataOperatorUser();
  const linkExistingCase = useLinkExistingCase();
  const [rowError, setRowError] = useState({});
  // Multi-Case-Per-Person Support - which row's "Link to existing person"
  // modal is open, if any (null when closed), and any error from that modal's
  // own attempt (kept separate from rowError since the row itself isn't
  // visible while the modal is open).
  const [linkingUser, setLinkingUser] = useState(null);
  const [linkError, setLinkError] = useState(null);

  const users = data?.users || [];

  const handleLinkSelect = async (targetPerson) => {
    setLinkError(null);
    try {
      await linkExistingCase.mutate(linkingUser.userId, targetPerson.anchorUserId);
      setLinkingUser(null);
      refetch();
    } catch (err) {
      // Surfaced in plain language server-side already (e.g. "This case
      // already has activity of its own and can't be linked - only a case
      // with no activity yet can be merged into another person"). Kept open
      // so the operator can see why and pick a different person instead.
      setLinkError(err.message || 'Could not link this case.');
    }
  };

  const handleStageChange = async (userId, caseStage) => {
    setRowError((prev) => ({ ...prev, [userId]: null }));
    try {
      await updateUser.mutate(userId, { caseStage });
      refetch();
    } catch (err) {
      setRowError((prev) => ({ ...prev, [userId]: err.message }));
    }
  };

  const handleStatusToggle = async (userId, currentStatus) => {
    setRowError((prev) => ({ ...prev, [userId]: null }));
    try {
      await updateUser.mutate(userId, { status: currentStatus === 'active' ? 'inactive' : 'active' });
      refetch();
    } catch (err) {
      setRowError((prev) => ({ ...prev, [userId]: err.message }));
    }
  };

  const handleDelete = async (userId, docketNumber) => {
    if (!window.confirm(`Delete user record ${docketNumber}? This only works if the case has no history yet.`)) return;
    setRowError((prev) => ({ ...prev, [userId]: null }));
    try {
      await deleteUser.mutate(userId);
      refetch();
    } catch (err) {
      setRowError((prev) => ({ ...prev, [userId]: err.message }));
    }
  };

  return (
    <StaffLayout title="Users">
      <div className="bg-white rounded-xl border border-gray-200/80 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#EBF4FA]/60 text-gray-600 text-[11px] uppercase tracking-wider font-semibold border-b border-gray-100">
                <th className="py-3 px-6">Docket</th>
                <th className="py-3 px-4">Name</th>
                <th className="py-3 px-4">Contact</th>
                <th className="py-3 px-4">Case Type</th>
                <th className="py-3 px-4">Jurisdiction</th>
                <th className="py-3 px-4">Case Stage</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-6 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-xs">
              {loading ? (
                <tr><td colSpan={8} className="py-8 text-center text-gray-400">Loading...</td></tr>
              ) : error ? (
                <tr><td colSpan={8} className="py-8 text-center text-rose-600">{error}</td></tr>
              ) : users.length === 0 ? (
                <tr><td colSpan={8} className="py-8 text-center text-gray-400">No users registered yet.</td></tr>
              ) : users.map((u) => (
                <tr key={u.userId} className="hover:bg-gray-50/70 transition align-top">
                  <td className="py-3 px-6 font-bold text-gray-800">{u.docketNumber}</td>
                  <td className="py-3 px-4 text-gray-700">{u.fullName || '-'}</td>
                  <td className="py-3 px-4 text-gray-700">{u.contactNumber || '-'}</td>
                  <td className="py-3 px-4 text-gray-700">{u.caseType || '-'}</td>
                  <td className="py-3 px-4 text-gray-700">{u.jurisdictionName || '-'}</td>
                  <td className="py-3 px-4">
                    <select
                      value={u.caseStage}
                      onChange={(e) => handleStageChange(u.userId, e.target.value)}
                      disabled={updateUser.loading}
                      className="px-2 py-1 border border-gray-300 rounded text-xs bg-white"
                    >
                      {CASE_STAGE_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </td>
                  <td className="py-3 px-4">
                    <StatusToggle
                      status={u.status}
                      onToggle={() => handleStatusToggle(u.userId, u.status)}
                      disabled={updateUser.loading}
                    />
                  </td>
                  <td className="py-3 px-6 text-right whitespace-nowrap">
                    <button
                      onClick={() => { setLinkError(null); setLinkingUser(u); }}
                      className="p-1.5 text-gray-400 hover:text-[#519BCE] disabled:opacity-50"
                      title="Link to existing person"
                    >
                      <Link2 size={14} />
                    </button>
                    <button
                      onClick={() => handleDelete(u.userId, u.docketNumber)}
                      disabled={deleteUser.loading}
                      className="p-1.5 text-gray-400 hover:text-rose-600 disabled:opacity-50"
                      title="Delete"
                    >
                      <Trash2 size={14} />
                    </button>
                    {rowError[u.userId] && <p className="text-[10px] text-rose-600 mt-1 max-w-[160px]">{rowError[u.userId]}</p>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Multi-Case-Per-Person Support - "these two docket numbers turned out
          to be the same person" cleanup flow: link this row's case into
          another person's existing case family. Same overlay pattern as
          StaffLayout's Log Out confirm dialog. */}
      {linkingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-800">
                Link {linkingUser.docketNumber} to an existing person
              </h3>
              <button onClick={() => setLinkingUser(null)} className="p-1 text-gray-400 hover:text-gray-600" aria-label="Close">
                <X size={18} />
              </button>
            </div>
            <p className="text-xs text-gray-500">
              Only works if {linkingUser.docketNumber} has no check-ins or messages of its own yet - a case that's
              already been actively used can't be merged into another person.
            </p>
            {linkError && <p className="text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{linkError}</p>}
            <PersonSearchPicker onSelect={handleLinkSelect} excludeUserId={linkingUser.userId} />
          </div>
        </div>
      )}
    </StaffLayout>
  );
}
