import React, { useState } from 'react';
import StaffLayout from '../../layouts/StaffLayout';
import { Trash2 } from 'lucide-react';
import { useDataIntakeVictims, useUpdateDataIntakeVictim, useDeleteDataIntakeVictim } from '../../services/hooks';

// 'Case Closed' is a terminal stage settable only by Data Operator (this
// screen) - District Admin's equivalent editor stays restricted to the
// original 4 (services/victimProvisioning.js enforces this server-side).
const CASE_STAGE_OPTIONS = ['Investigation', 'Trial', 'Rehabilitation', 'Compensation', 'Case Closed'];
const STATUS_BADGE = { active: 'bg-emerald-100 text-emerald-700', inactive: 'bg-gray-100 text-gray-500' };

// Feature Catalog Section 7 extension (explicit user request) - every victim
// this Data Operator flow has registered, with full detail and the
// ability to update case stage/status or delete a mistaken entry. Delete
// only actually succeeds server-side for a victim with no case history yet
// (see services/victimProvisioning.js's deleteVictim) - the error message
// from a blocked delete is surfaced as-is, suggesting "mark inactive" instead.
export default function Victims() {
  const { data, loading, error, refetch } = useDataIntakeVictims();
  const updateVictim = useUpdateDataIntakeVictim();
  const deleteVictim = useDeleteDataIntakeVictim();
  const [rowError, setRowError] = useState({});

  const victims = data?.victims || [];

  const handleStageChange = async (victimId, caseStage) => {
    setRowError((prev) => ({ ...prev, [victimId]: null }));
    try {
      await updateVictim.mutate(victimId, { caseStage });
      refetch();
    } catch (err) {
      setRowError((prev) => ({ ...prev, [victimId]: err.message }));
    }
  };

  const handleStatusToggle = async (victimId, currentStatus) => {
    setRowError((prev) => ({ ...prev, [victimId]: null }));
    try {
      await updateVictim.mutate(victimId, { status: currentStatus === 'active' ? 'inactive' : 'active' });
      refetch();
    } catch (err) {
      setRowError((prev) => ({ ...prev, [victimId]: err.message }));
    }
  };

  const handleDelete = async (victimId, docketNumber) => {
    if (!window.confirm(`Delete victim record ${docketNumber}? This only works if the case has no history yet.`)) return;
    setRowError((prev) => ({ ...prev, [victimId]: null }));
    try {
      await deleteVictim.mutate(victimId);
      refetch();
    } catch (err) {
      setRowError((prev) => ({ ...prev, [victimId]: err.message }));
    }
  };

  return (
    <StaffLayout title="Victims" section="dataintake">
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
              ) : victims.length === 0 ? (
                <tr><td colSpan={8} className="py-8 text-center text-gray-400">No victims registered yet.</td></tr>
              ) : victims.map((v) => (
                <tr key={v.victimId} className="hover:bg-gray-50/70 transition align-top">
                  <td className="py-3 px-6 font-bold text-gray-800">{v.docketNumber}</td>
                  <td className="py-3 px-4 text-gray-700">{v.fullName || '-'}</td>
                  <td className="py-3 px-4 text-gray-700">{v.contactNumber || '-'}</td>
                  <td className="py-3 px-4 text-gray-700">{v.caseType || '-'}</td>
                  <td className="py-3 px-4 text-gray-700">{v.jurisdictionName || '-'}</td>
                  <td className="py-3 px-4">
                    <select
                      value={v.caseStage}
                      onChange={(e) => handleStageChange(v.victimId, e.target.value)}
                      disabled={updateVictim.loading}
                      className="px-2 py-1 border border-gray-300 rounded text-xs bg-white"
                    >
                      {CASE_STAGE_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </td>
                  <td className="py-3 px-4">
                    <button
                      onClick={() => handleStatusToggle(v.victimId, v.status)}
                      disabled={updateVictim.loading}
                      className={`px-2.5 py-1 rounded text-[10px] font-bold ${STATUS_BADGE[v.status] || 'bg-gray-100 text-gray-600'}`}
                    >
                      {v.status}
                    </button>
                  </td>
                  <td className="py-3 px-6 text-right">
                    <button
                      onClick={() => handleDelete(v.victimId, v.docketNumber)}
                      disabled={deleteVictim.loading}
                      className="p-1.5 text-gray-400 hover:text-rose-600 disabled:opacity-50"
                      title="Delete"
                    >
                      <Trash2 size={14} />
                    </button>
                    {rowError[v.victimId] && <p className="text-[10px] text-rose-600 mt-1 max-w-[160px]">{rowError[v.victimId]}</p>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </StaffLayout>
  );
}
