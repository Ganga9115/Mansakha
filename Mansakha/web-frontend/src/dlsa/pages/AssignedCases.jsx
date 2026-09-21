import React from 'react';
import { useNavigate } from 'react-router-dom';
import StaffLayout from '../layouts/StaffLayout';
import { ArrowRight, AlertTriangle } from 'lucide-react';
import { useLegalAidRequestsList } from '../services/hooks';

// migration_040 - DLSA's monitoring view of every case that has moved past
// intake into active representation: Active (a representative is currently
// working it, including one awaiting a poor-feedback decision) and
// Completed (closed out). Same list -> detail page as LegalAidQueue.jsx,
// just the tail of the lifecycle rather than the intake/review stages.

const STATUS_BADGE = {
  Active: 'bg-emerald-100 text-emerald-700',
  Completed: 'bg-gray-200 text-gray-700',
};

export default function AssignedCases() {
  const navigate = useNavigate();
  const activeQuery = useLegalAidRequestsList('Active');
  const completedQuery = useLegalAidRequestsList('Completed');

  const activeCases = activeQuery.data?.requests || [];
  const completedCases = completedQuery.data?.requests || [];
  const loading = activeQuery.loading || completedQuery.loading;
  const error = activeQuery.error || completedQuery.error;
  const cases = [...activeCases, ...completedCases];

  return (
    <StaffLayout title="Assigned Cases">
      <div className="bg-white p-4 rounded-xl border border-gray-200/80 shadow-sm space-y-4">
        <div>
          <h3 className="font-bold text-sm text-gray-800">Assigned Cases</h3>
          <p className="text-[11px] text-gray-400">Cases with a representative currently assigned, or already concluded.</p>
        </div>

        <div className="border border-gray-200/80 rounded-xl overflow-hidden overflow-x-auto">
          {loading ? (
            <p className="text-sm text-gray-400 p-6">Loading...</p>
          ) : error ? (
            <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm px-4 py-3 m-4 rounded-lg">{error}</div>
          ) : cases.length === 0 ? (
            <p className="text-sm text-gray-400 p-6">No assigned cases yet.</p>
          ) : (
            <table className="w-full text-left min-w-[640px]">
              <thead>
                <tr className="bg-gray-50 text-[11px] font-bold text-gray-500 uppercase">
                  <th className="px-6 py-3">Docket Number</th>
                  <th className="px-6 py-3">Victim</th>
                  <th className="px-6 py-3">Case Type</th>
                  <th className="px-6 py-3">Status</th>
                  <th className="px-6 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {cases.map((r) => (
                  <tr key={r.requestId} className="hover:bg-gray-50/70 transition">
                    <td className="px-6 py-3.5 text-sm font-bold text-gray-800">{r.docketNumber}</td>
                    <td className="px-6 py-3.5 text-xs text-gray-600">{r.victimName || '—'}</td>
                    <td className="px-6 py-3.5 text-xs text-gray-500">{r.caseTypeName}</td>
                    <td className="px-6 py-3.5">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${STATUS_BADGE[r.status] || 'bg-gray-100 text-gray-600'}`}>{r.status}</span>
                    </td>
                    <td className="px-6 py-3.5 text-right">
                      <button
                        onClick={() => navigate(`/dlsa/legal-aid-requests/${r.requestId}`)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-brand-600 text-brand-600 hover:bg-brand-700 hover:text-white rounded-md text-xs font-semibold transition"
                      >
                        View <ArrowRight size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <p className="flex items-center gap-1.5 text-[10px] text-gray-400">
          <AlertTriangle size={12} /> Cases needing reassignment review (poor feedback awaiting your decision) are flagged on their own detail page.
        </p>
      </div>
    </StaffLayout>
  );
}
