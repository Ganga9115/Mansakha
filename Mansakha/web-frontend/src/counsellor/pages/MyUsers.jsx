import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import StaffLayout from '../layouts/StaffLayout';
import { useMyUsers } from '../services/hooks';

const RISK_BADGE = {
  Critical: 'bg-purple-100 text-purple-700',
  High: 'bg-rose-100 text-rose-700',
  Moderate: 'bg-amber-100 text-amber-700',
  Low: 'bg-emerald-100 text-emerald-700',
};

const PAGE_SIZE = 20;

export default function MyUsers() {
  const [riskLevel, setRiskLevel] = useState('');
  const [page, setPage] = useState(1);
  const { data, loading, error } = useMyUsers(riskLevel || undefined, page);
  const navigate = useNavigate();

  const cases = data?.cases || [];
  const total = data?.total || 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <StaffLayout title="My Users">
      <div className="space-y-6">

        {/* FILTER BAR */}
        <div className="bg-white p-4 rounded-xl border border-gray-200/80 shadow-sm flex flex-wrap items-center justify-between gap-3 text-xs">
          <select
            value={riskLevel}
            onChange={(e) => { setRiskLevel(e.target.value); setPage(1); }}
            className="px-3 py-2 bg-[#F8F9FA] rounded-lg text-gray-700 font-medium border-none focus:outline-none focus:ring-1 focus:ring-[#519BCE]"
          >
            <option value="">Risk Level: All</option>
            <option value="Critical">Critical</option>
            <option value="High">High</option>
            <option value="Moderate">Moderate</option>
            <option value="Low">Low</option>
          </select>
        </div>

        {error && <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm px-4 py-3 rounded-lg">{error}</div>}

        {/* DATA TABLE */}
        <div className="bg-white rounded-xl border border-gray-200/80 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#EBF4FA]/60 text-gray-600 text-[11px] uppercase tracking-wider font-semibold border-b border-gray-100">
                  <th className="py-3.5 px-6">User ID</th>
                  <th className="py-3.5 px-4">Case Stage</th>
                  <th className="py-3.5 px-4">Distress Score</th>
                  <th className="py-3.5 px-4">Risk Level</th>
                  <th className="py-3.5 px-6 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-xs">
                {loading ? (
                  <tr><td colSpan={5} className="py-8 text-center text-gray-400">Loading...</td></tr>
                ) : cases.length === 0 ? (
                  <tr><td colSpan={5} className="py-8 text-center text-gray-400">No cases in this queue yet.</td></tr>
                ) : cases.map((item) => (
                  <tr key={item.userId} className="hover:bg-gray-50/70 transition">
                    <td className="py-4 px-6">
                    <p className="font-bold text-gray-800">Case {item.userId.slice(0, 8)}</p>
                    {item.caseBackground && (
                      <p className="text-[11px] text-gray-400 mt-0.5 max-w-xs truncate">{item.caseBackground}</p>
                    )}
                  </td>
                    <td className="py-4 px-4 text-gray-700 font-medium">{item.caseStage || '-'}</td>
                    <td className="py-4 px-4">
                      {item.score != null ? (
                        <div className="flex items-center gap-3">
                          <div className="w-16 h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${item.score >= 85 ? 'bg-purple-900' : item.score >= 70 ? 'bg-red-600' : 'bg-amber-500'}`}
                              style={{ width: `${item.score}%` }}
                            />
                          </div>
                          <span className="font-bold text-gray-800">{item.score}</span>
                        </div>
                      ) : <span className="text-gray-400">-</span>}
                    </td>
                    <td className="py-4 px-4">
                      {item.riskLevel ? (
                        <span className={`px-2.5 py-1 rounded text-[10px] font-bold ${RISK_BADGE[item.riskLevel] || 'bg-gray-100 text-gray-600'}`}>
                          {item.riskLevel}
                        </span>
                      ) : <span className="text-gray-400">-</span>}
                    </td>
                    <td className="py-4 px-6 text-right">
                      <button
                        onClick={() => navigate(`/counsellor/case-detail/${item.userId}`)}
                        className="px-3 py-1.5 border border-[#519BCE] text-[#519BCE] hover:bg-[#519BCE] hover:text-white rounded-md text-xs font-medium transition"
                      >
                        View Case
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* PAGINATION FOOTER */}
        <div className="flex items-center justify-between text-xs text-gray-500 pt-2">
          <span>{total === 0 ? 'No cases' : `Page ${page} of ${totalPages} (${total} cases)`}</span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="px-3 py-1.5 rounded border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-50"
            >
              Previous
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="px-3 py-1.5 rounded border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>

      </div>
    </StaffLayout>
  );
}
