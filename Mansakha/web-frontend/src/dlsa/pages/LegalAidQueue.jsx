import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import StaffLayout from '../layouts/StaffLayout';
import { ArrowRight } from 'lucide-react';
import { useLegalAidRequestsList } from '../services/hooks';

// migration_040 - the real Legal Aid intake queue, replacing this page's old
// agency_referrals-backed content in place (same route/nav slot). Same
// scannable-list, action-lives-on-detail convention as before (and every
// other list -> detail page in this app) - just pointed at the new
// jurisdiction-scoped legal_aid_requests pipeline. "Assigned Cases" (the
// Active/Completed tail of this same lifecycle) is its own page - this one
// covers the intake/review stages a DLSA actually triages day to day.

const STATUS_BADGE = {
  Submitted: 'bg-amber-100 text-amber-700',
  'Under Review': 'bg-sky-100 text-sky-700',
  Verified: 'bg-indigo-100 text-indigo-700',
  Approved: 'bg-teal-100 text-teal-700',
  Rejected: 'bg-rose-100 text-rose-700',
  Active: 'bg-emerald-100 text-emerald-700',
  Completed: 'bg-gray-200 text-gray-700',
};

const INTAKE_TABS = ['Submitted', 'Under Review', 'Verified', 'Approved', 'Rejected'];

export default function LegalAidQueue() {
  const navigate = useNavigate();
  const [tab, setTab] = useState('Submitted');
  const query = useLegalAidRequestsList(tab);
  const requests = query.data?.requests || [];
  const jurisdictionAssigned = query.data?.jurisdictionAssigned !== false;

  return (
    <StaffLayout title="Legal Aid Requests">
      <div className="space-y-4">
        {!query.loading && !jurisdictionAssigned && (
          <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm px-4 py-3 rounded-lg">
            Your account has no jurisdiction (district) assigned yet, so your Legal Aid Requests queue is empty. Ask Ministry to assign one via Staff Management.
          </div>
        )}

        <div className="bg-white p-4 rounded-xl border border-gray-200/80 shadow-sm space-y-4">
          <div>
            <h3 className="font-bold text-sm text-gray-800">Legal Aid Requests</h3>
            <p className="text-[11px] text-gray-400">Requests filed by victims in your district, awaiting review, verification, or approval.</p>
          </div>

          <div className="flex flex-wrap gap-2">
            {INTAKE_TABS.map((s) => (
              <button
                key={s}
                onClick={() => setTab(s)}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition ${
                  tab === s ? 'bg-[#519BCE] text-white shadow-sm' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
                }`}
              >
                {s}
              </button>
            ))}
          </div>

          <div className="border border-gray-200/80 rounded-xl overflow-hidden overflow-x-auto">
            {query.loading ? (
              <p className="text-sm text-gray-400 p-6">Loading...</p>
            ) : query.error ? (
              <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm px-4 py-3 m-4 rounded-lg">{query.error}</div>
            ) : requests.length === 0 ? (
              <p className="text-sm text-gray-400 p-6">No requests with status "{tab}".</p>
            ) : (
              <table className="w-full text-left min-w-[720px]">
                <thead>
                  <tr className="bg-gray-50 text-[11px] font-bold text-gray-500 uppercase">
                    <th className="px-6 py-3">Docket Number</th>
                    <th className="px-6 py-3">Victim</th>
                    <th className="px-6 py-3">Case Type</th>
                    <th className="px-6 py-3">Submitted On</th>
                    <th className="px-6 py-3">Status</th>
                    <th className="px-6 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {requests.map((r) => (
                    <tr key={r.requestId} className="hover:bg-gray-50/70 transition">
                      <td className="px-6 py-3.5 text-sm font-bold text-gray-800">{r.docketNumber}</td>
                      <td className="px-6 py-3.5 text-xs text-gray-600">{r.victimName || '—'}</td>
                      <td className="px-6 py-3.5 text-xs text-gray-500">{r.caseTypeName}</td>
                      <td className="px-6 py-3.5 text-xs text-gray-500">
                        {new Date(r.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </td>
                      <td className="px-6 py-3.5">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${STATUS_BADGE[r.status] || 'bg-gray-100 text-gray-600'}`}>{r.status}</span>
                      </td>
                      <td className="px-6 py-3.5 text-right">
                        <button
                          onClick={() => navigate(`/dlsa/legal-aid-requests/${r.requestId}`)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-[#519BCE] text-[#519BCE] hover:bg-[#519BCE] hover:text-white rounded-md text-xs font-semibold transition"
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
        </div>
      </div>
    </StaffLayout>
  );
}
