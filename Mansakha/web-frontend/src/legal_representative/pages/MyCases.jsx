import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import StaffLayout from '../layouts/StaffLayout';
import { ArrowRight } from 'lucide-react';
import { useMyCases } from '../services/hooks';

// Only cases directly assigned to this representative - filtered by
// assignment, never by jurisdiction (see legalRepresentative.routes.js's own
// comment on why). Pending needs an Accept/Reject decision (requirement 6)
// before it's genuinely yours; Active is the working list once accepted;
// History shows cases that moved on (Rejected, Reassigned away, or
// Completed) - full history never deleted.

const ASSIGNMENT_STATUS_BADGE = {
  'Pending Acceptance': 'bg-amber-100 text-amber-700',
  Active: 'bg-emerald-100 text-emerald-700',
  Rejected: 'bg-rose-100 text-rose-700',
  Reassigned: 'bg-gray-200 text-gray-600',
  Completed: 'bg-gray-200 text-gray-700',
};

export default function MyCases() {
  const navigate = useNavigate();
  const [tab, setTab] = useState('active');
  const query = useMyCases(tab === 'active' ? undefined : tab);
  const cases = query.data?.cases || [];

  return (
    <StaffLayout title="My Cases">
      <div className="bg-white p-4 rounded-xl border border-gray-200/80 shadow-sm space-y-4">
        <div>
          <h3 className="font-bold text-sm text-gray-800">My Cases</h3>
          <p className="text-[11px] text-gray-400">Legal Aid cases DLSA has assigned to you.</p>
        </div>

        <div className="flex flex-wrap gap-2">
          {[{ key: 'pending', label: 'Pending' }, { key: 'active', label: 'Active' }, { key: 'history', label: 'History' }].map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition ${
                tab === t.key ? 'bg-[#519BCE] text-white shadow-sm' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="border border-gray-200/80 rounded-xl overflow-hidden overflow-x-auto">
          {query.loading ? (
            <p className="text-sm text-gray-400 p-6">Loading...</p>
          ) : query.error ? (
            <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm px-4 py-3 m-4 rounded-lg">{query.error}</div>
          ) : cases.length === 0 ? (
            <p className="text-sm text-gray-400 p-6">
              {tab === 'history' ? 'No past cases.' : tab === 'pending' ? 'No cases awaiting your decision.' : 'No active cases.'}
            </p>
          ) : (
            <table className="w-full text-left min-w-[720px]">
              <thead>
                <tr className="bg-gray-50 text-[11px] font-bold text-gray-500 uppercase">
                  <th className="px-6 py-3">Docket Number</th>
                  <th className="px-6 py-3">Case Type</th>
                  <th className="px-6 py-3">Case Stage</th>
                  <th className="px-6 py-3">Next Hearing</th>
                  <th className="px-6 py-3">Assignment</th>
                  <th className="px-6 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {cases.map((c) => (
                  <tr key={c.assignmentId} className="hover:bg-gray-50/70 transition">
                    <td className="px-6 py-3.5 text-sm font-bold text-gray-800">{c.docketNumber}</td>
                    <td className="px-6 py-3.5 text-xs text-gray-500">{c.caseTypeName}</td>
                    <td className="px-6 py-3.5 text-xs text-gray-500">{c.caseStage}</td>
                    <td className="px-6 py-3.5 text-xs text-gray-500">
                      {c.nextHearingDate ? new Date(c.nextHearingDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                    </td>
                    <td className="px-6 py-3.5">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${ASSIGNMENT_STATUS_BADGE[c.assignmentStatus] || 'bg-gray-100 text-gray-600'}`}>{c.assignmentStatus}</span>
                    </td>
                    <td className="px-6 py-3.5 text-right">
                      <button
                        onClick={() => navigate(`/legalrepresentative/cases/${c.requestId}`)}
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
    </StaffLayout>
  );
}
