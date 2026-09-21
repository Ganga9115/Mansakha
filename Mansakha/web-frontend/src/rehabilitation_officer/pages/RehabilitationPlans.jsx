import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import StaffLayout from '../layouts/StaffLayout';
import { ArrowRight } from 'lucide-react';
import { useReferralsList } from '../services/hooks';

// Rehabilitation Officer's Rehabilitation Plans - a clean, scannable list
// only. Every action (progress updates, resolve, task assignment) now
// lives on the dedicated Referral Detail page (see ReferralDetail.jsx),
// matching the list -> detail convention established by
// dwo/pages/ReferralQueue.jsx, rather than cramming every action into an
// inline accordion within the list itself.

const STATUS_BADGE = {
  Open: 'bg-amber-100 text-amber-700',
  Resolved: 'bg-emerald-100 text-emerald-700',
};

export default function RehabilitationPlans() {
  const navigate = useNavigate();
  const [tab, setTab] = useState('Open');
  const query = useReferralsList(tab);
  const referrals = query.data?.referrals || [];

  return (
    <StaffLayout title="Rehabilitation Plans">
      <div className="space-y-4">
        <div className="bg-white p-4 rounded-xl border border-gray-200/80 shadow-sm space-y-4">
          <div>
            <h3 className="font-bold text-sm text-gray-800">Long-Term Rehabilitation</h3>
            <p className="text-[11px] text-gray-400">Livelihood, housing, and schooling support for victims in the post-case-closure phase - updates here appear on the victim's own dashboard.</p>
          </div>

          <div className="flex flex-wrap gap-2">
            {['Open', 'Resolved'].map((s) => (
              <button
                key={s}
                onClick={() => setTab(s)}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition ${
                  tab === s ? 'bg-brand-700 text-white shadow-sm' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
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
            ) : referrals.length === 0 ? (
              <p className="text-sm text-gray-400 p-6">No {tab.toLowerCase()} plans.</p>
            ) : (
              <table className="w-full text-left min-w-[640px]">
                <thead>
                  <tr className="bg-gray-50 text-[11px] font-bold text-gray-500 uppercase">
                    <th className="px-6 py-3">Docket Number</th>
                    <th className="px-6 py-3">Case Type</th>
                    <th className="px-6 py-3">Referred On</th>
                    <th className="px-6 py-3">Status</th>
                    <th className="px-6 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {referrals.map((r) => (
                    <tr key={r.referralId} className="hover:bg-gray-50/70 transition">
                      <td className="px-6 py-3.5 text-sm font-bold text-gray-800">{r.docketNumber}</td>
                      <td className="px-6 py-3.5 text-xs text-gray-500">{r.caseTypeName}</td>
                      <td className="px-6 py-3.5 text-xs text-gray-500">
                        {new Date(r.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </td>
                      <td className="px-6 py-3.5">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${STATUS_BADGE[r.status] || 'bg-gray-100 text-gray-600'}`}>{r.status}</span>
                      </td>
                      <td className="px-6 py-3.5 text-right">
                        <button
                          onClick={() => navigate(`/rehabilitationofficer/referrals/${r.referralId}`)}
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
        </div>
      </div>
    </StaffLayout>
  );
}
