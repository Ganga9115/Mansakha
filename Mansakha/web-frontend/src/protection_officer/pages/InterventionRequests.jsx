import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import StaffLayout from '../layouts/StaffLayout';
import { ArrowRight } from 'lucide-react';
import { useInterventionRequestsList } from '../services/hooks';

// Protection Officer's own proof-verified review queue for Witness
// Protection and Relocation Request Assistance submissions - District
// Admin no longer decides on these (see interventionRequestReview.js).
// A clean, scannable list only - matching the list -> detail convention
// ProtectionRegistry.jsx/ReferralDetail.jsx already use. Every action
// (accept, reject, contact details, proof documents) now lives on the
// dedicated InterventionRequestDetail.jsx page, replacing the inline
// accordion this page used to share with district_admin's own copy.

const STATUS_BADGE = {
  Pending: 'bg-amber-100 text-amber-700',
  Accepted: 'bg-emerald-100 text-emerald-700',
  Rejected: 'bg-rose-100 text-rose-700',
};

export default function InterventionRequests() {
  const navigate = useNavigate();
  const [tab, setTab] = useState('Pending');
  const query = useInterventionRequestsList(tab);
  const requests = query.data?.requests || [];
  const jurisdictionAssigned = query.data?.jurisdictionAssigned !== false;

  return (
    <StaffLayout title="Intervention Requests">
      <div className="space-y-4">
        <div className="bg-white p-4 rounded-xl border border-gray-200/80 shadow-sm space-y-4">
          <div>
            <h3 className="font-bold text-sm text-gray-800">Intervention Requests</h3>
            <p className="text-[11px] text-gray-400">Victims in your district request Witness Protection or Relocation with proof documents (FIR copy, police threat assessment, proof of address). Review and decide here - accepting creates a referral in your own Protection Registry.</p>
          </div>

          {!jurisdictionAssigned && (
            <div className="bg-amber-50 border border-amber-200 text-amber-700 text-xs px-4 py-3 rounded-lg">
              You are not yet assigned to a district. Kindly contact Ministry to be assigned before requests can appear here.
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {['Pending', 'Accepted', 'Rejected'].map((s) => (
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
              <p className="text-sm text-gray-400 p-6">No {tab.toLowerCase()} requests.</p>
            ) : (
              <table className="w-full text-left min-w-[640px]">
                <thead>
                  <tr className="bg-gray-50 text-[11px] font-bold text-gray-500 uppercase">
                    <th className="px-6 py-3">Docket Number</th>
                    <th className="px-6 py-3">Intervention Type</th>
                    <th className="px-6 py-3">Case Type</th>
                    <th className="px-6 py-3">Requested On</th>
                    <th className="px-6 py-3">Status</th>
                    <th className="px-6 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {requests.map((r) => (
                    <tr key={r.requestId} className="hover:bg-gray-50/70 transition">
                      <td className="px-6 py-3.5 text-sm font-bold text-gray-800">{r.docketNumber}</td>
                      <td className="px-6 py-3.5 text-xs text-gray-500">{r.interventionTypeName}</td>
                      <td className="px-6 py-3.5 text-xs text-gray-500">{r.caseTypeName}</td>
                      <td className="px-6 py-3.5 text-xs text-gray-500">
                        {new Date(r.requestedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </td>
                      <td className="px-6 py-3.5">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${STATUS_BADGE[r.status] || 'bg-gray-100 text-gray-600'}`}>{r.status}</span>
                      </td>
                      <td className="px-6 py-3.5 text-right">
                        <button
                          onClick={() => navigate(`/protectionofficer/intervention-requests/${r.requestId}`)}
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
