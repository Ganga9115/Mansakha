import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import { usePageHeader } from '../../shared/context/PageHeaderContext';
import { useMyUsers } from '../services/hooks';
import GlideSelect from '../../shared/components/GlideSelect';

const RISK_BADGE = {
  Critical: 'bg-red-100 text-red-800 border border-red-300',
  High: 'bg-orange-100 text-orange-800 border border-orange-300',
  Moderate: 'bg-amber-100 text-amber-700',
  Low: 'bg-emerald-100 text-emerald-800 border border-emerald-300',
};

const RISK_LEVEL_OPTIONS = [
  { value: '', label: 'Risk Level: All' },
  { value: 'Critical', label: 'Critical' },
  { value: 'High', label: 'High' },
  { value: 'Moderate', label: 'Moderate' },
  { value: 'Low', label: 'Low' },
];

const PAGE_SIZE = 20;

export default function MyUsers() {
  usePageHeader({ title: 'My Users' });
  const [riskLevel, setRiskLevel] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const { data, loading, error } = useMyUsers(riskLevel || undefined, page, search || undefined);
  const navigate = useNavigate();

  const cases = data?.cases || [];
  const total = data?.total || 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <div className="space-y-6">

        {/* FILTER BAR */}
        <div className="bg-white p-3 sm:p-4 rounded-xl border border-gray-200/80 shadow-sm flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 text-xs">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search by name, docket number, or case ID..."
              className="w-full pl-9 pr-3 py-2 bg-brand-50 rounded-lg text-gray-700 font-medium border-none focus:outline-none focus:ring-1 focus:ring-brand-600"
            />
          </div>
          <GlideSelect
            options={RISK_LEVEL_OPTIONS}
            value={riskLevel}
            onChange={(val) => { setRiskLevel(val); setPage(1); }}
            ariaLabel="Risk Level"
          />
        </div>

        {error && <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm px-4 py-3 rounded-lg">{error}</div>}

        {/* MOBILE CARDS VIEW (Visible below md breakpoint) */}
        <div className="block md:hidden space-y-3">
          {loading ? (
            <div className="bg-white p-6 rounded-xl border border-gray-100 text-center text-xs text-gray-400">Loading cases...</div>
          ) : cases.length === 0 ? (
            <div className="bg-white p-6 rounded-xl border border-gray-100 text-center text-xs text-gray-400">No cases in this queue yet.</div>
          ) : (
            cases.map((item) => (
              <div key={item.userId} className="bg-white p-4 rounded-xl border border-gray-200/80 shadow-xs space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h4 className="font-bold text-gray-900 text-sm">{item.fullName || `Case ${item.userId.slice(0, 8)}`}</h4>
                    <p className="text-[11px] text-gray-500 mt-0.5">
                      {item.docketNumber ? `Docket ${item.docketNumber}` : `Case ${item.userId.slice(0, 8)}`}
                    </p>
                  </div>
                  {item.riskLevel && (
                    <span className={`px-2.5 py-0.5 rounded text-[10px] font-bold shrink-0 ${RISK_BADGE[item.riskLevel] || 'bg-gray-100 text-gray-600'}`}>
                      {item.riskLevel}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2 pt-1 border-t border-gray-50 text-xs">
                  <div>
                    <span className="text-[10px] text-gray-400 uppercase font-semibold block">Stage</span>
                    <span className="font-medium text-gray-700">{item.caseStage || '-'}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-gray-400 uppercase font-semibold block">Distress Score</span>
                    {item.score != null ? (
                      <div className="flex items-center gap-2 mt-0.5">
                        <div className="w-14 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${item.score >= 85 ? 'bg-purple-900' : item.score >= 70 ? 'bg-red-600' : 'bg-amber-500'}`}
                            style={{ width: `${item.score}%` }}
                          />
                        </div>
                        <span className="font-bold text-gray-800 text-xs">{item.score}</span>
                      </div>
                    ) : (
                      <span className="text-gray-400 font-medium">-</span>
                    )}
                  </div>
                </div>

                {item.caseBackground && (
                  <p className="text-[11px] text-gray-500 line-clamp-2 bg-gray-50 p-2 rounded-lg">{item.caseBackground}</p>
                )}

                <div className="pt-2 border-t border-gray-50 flex justify-end">
                  <div className="relative inline-block w-full sm:w-auto">
                    <button
                      onClick={() => navigate(`/counsellor/case-detail/${item.userId}`)}
                      className="w-full sm:w-auto px-4 py-2 border border-brand-600 text-brand-600 hover:bg-brand-700 hover:text-white rounded-lg text-xs font-semibold transition text-center"
                    >
                      View Case File
                    </button>
                    {item.hasUnreadMessage && (
                      <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full border border-white"></span>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* DESKTOP DATA TABLE (Visible at md and above) */}
        <div className="hidden md:block bg-white rounded-xl border border-gray-200/80 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[640px]">
              <thead>
                <tr className="bg-brand-50/60 text-gray-600 text-[11px] uppercase tracking-wider font-semibold border-b border-gray-100">
                  <th className="py-3.5 px-6">Name / Docket</th>
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
                    <p className="font-bold text-gray-800">{item.fullName || `Case ${item.userId.slice(0, 8)}`}</p>
                    <p className="text-[11px] text-gray-500 mt-0.5">
                      {item.docketNumber ? `Docket ${item.docketNumber}` : `Case ${item.userId.slice(0, 8)}`}
                    </p>
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
                      <div className="relative inline-block">
                        <button
                          onClick={() => navigate(`/counsellor/case-detail/${item.userId}`)}
                          className="px-3 py-1.5 border border-brand-600 text-brand-600 hover:bg-brand-700 hover:text-white rounded-md text-xs font-medium transition"
                        >
                          View Case
                        </button>
                        {item.hasUnreadMessage && (
                          <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full border border-white"></span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* PAGINATION FOOTER */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-gray-500 pt-2">
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
    </>
  );
}
