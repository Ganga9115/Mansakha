import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import StaffLayout from '../layouts/StaffLayout';
import { ArrowRight } from 'lucide-react';
import { useReferralsList } from '../services/hooks';

// Special Public Prosecutor's Trial Docket - a clean, scannable list only.
// Every action (notes, hearing request, outcome, task assignment) now lives
// on the dedicated Referral Overview/Log/Tasks pages, matching the
// list -> detail convention set by dwo/pages/ReferralQueue.jsx. Sorted by
// Case Priority (not just referral date) - the real "Special Court Docket
// prioritized by victim distress level and case age" feature, so the
// prosecutor sees what needs attention first, not just what came in first.

const STAGE_BADGE = {
  'Docket Received': 'bg-gray-100 text-gray-600',
  'Hearing Scheduled': 'bg-indigo-100 text-indigo-700',
  'Verdict Delivered': 'bg-emerald-100 text-emerald-700',
};

const PRIORITY_BADGE = {
  Standard: 'bg-gray-100 text-gray-600',
  Elevated: 'bg-amber-100 text-amber-700',
  High: 'bg-rose-100 text-rose-700',
};

const PRIORITY_RANK = { High: 0, Elevated: 1, Standard: 2 };

export default function TrialDocket() {
  const navigate = useNavigate();
  const [tab, setTab] = useState('Open');
  const query = useReferralsList(tab);
  const referrals = [...(query.data?.referrals || [])].sort(
    (a, b) => (PRIORITY_RANK[a.casePriority] ?? 9) - (PRIORITY_RANK[b.casePriority] ?? 9)
  );

  return (
    <StaffLayout title="Trial Docket">
      <div className="space-y-4">
        <div className="bg-white p-4 rounded-xl border border-gray-200/80 shadow-sm space-y-4">
          <div>
            <h3 className="font-bold text-sm text-gray-800">Prosecution Docket</h3>
            <p className="text-[11px] text-gray-400">Cases handed off from DLSA once marked trial-ready. Sorted by priority - older cases with higher victim distress surface first.</p>
          </div>

          <div className="flex flex-wrap gap-2">
            {['Open', 'Resolved'].map((s) => (
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
            ) : referrals.length === 0 ? (
              <p className="text-sm text-gray-400 p-6">No {tab.toLowerCase()} referrals.</p>
            ) : (
              <table className="w-full text-left min-w-[720px]">
                <thead>
                  <tr className="bg-gray-50 text-[11px] font-bold text-gray-500 uppercase">
                    <th className="px-6 py-3">Docket Number</th>
                    <th className="px-6 py-3">Case Type</th>
                    <th className="px-6 py-3">Case Age</th>
                    <th className="px-6 py-3">Priority</th>
                    <th className="px-6 py-3">Stage</th>
                    <th className="px-6 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {referrals.map((r) => (
                    <tr key={r.referralId} className="hover:bg-gray-50/70 transition">
                      <td className="px-6 py-3.5 text-sm font-bold text-gray-800">{r.docketNumber}</td>
                      <td className="px-6 py-3.5 text-xs text-gray-500">{r.caseTypeName}</td>
                      <td className="px-6 py-3.5 text-xs text-gray-500">{r.caseAgeDays} day{r.caseAgeDays === 1 ? '' : 's'}</td>
                      <td className="px-6 py-3.5">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${PRIORITY_BADGE[r.casePriority] || 'bg-gray-100 text-gray-600'}`}>{r.casePriority}</span>
                      </td>
                      <td className="px-6 py-3.5">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${STAGE_BADGE[r.stage] || 'bg-gray-100 text-gray-600'}`}>{r.stage}</span>
                      </td>
                      <td className="px-6 py-3.5 text-right">
                        <button
                          onClick={() => navigate(`/spp/referrals/${r.referralId}`)}
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
