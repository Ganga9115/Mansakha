import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, CheckCircle2 } from 'lucide-react';

// Shared summary bar (Docket/Case Type/Status/Referred On + Mark Resolved)
// reused across Overview/Activity Log/Tasks - the one thing that shouldn't
// duplicate across a case's three now-separate pages. THE TEMPLATE reused
// verbatim across the other 6 role folders.

const STATUS_BADGE = { Open: 'bg-amber-100 text-amber-700', Resolved: 'bg-emerald-100 text-emerald-700' };

export default function ReferralHeader({ r, backTo, backLabel, onResolve, resolveLoading, resolveLabel = 'Mark Resolved' }) {
  const navigate = useNavigate();
  return (
    <div className="space-y-4">
      <button onClick={() => navigate(backTo)} className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-gray-700 transition">
        <ArrowLeft size={14} /> {backLabel}
      </button>

      <div className="bg-white p-5 rounded-xl border border-gray-200/80 shadow-sm flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-10 flex-wrap">
          <div>
            <span className="text-[10px] font-bold tracking-wider text-gray-400 uppercase block">Docket Number</span>
            <span className="text-base font-bold text-gray-800">{r.docketNumber}</span>
          </div>
          <div>
            <span className="text-[10px] font-bold tracking-wider text-gray-400 uppercase block">Case Type</span>
            <span className="text-xs font-bold text-gray-700">{r.caseTypeName}</span>
          </div>
          <div>
            <span className="text-[10px] font-bold tracking-wider text-gray-400 uppercase block mb-1">Status</span>
            <span className={`text-xs font-bold px-2.5 py-0.5 rounded ${STATUS_BADGE[r.status] || 'bg-gray-100 text-gray-600'}`}>{r.status}</span>
          </div>
          <div>
            <span className="text-[10px] font-bold tracking-wider text-gray-400 uppercase block">Referred On</span>
            <span className="text-xs font-bold text-gray-700">{new Date(r.createdAt).toLocaleString()}</span>
          </div>
        </div>
        {r.status === 'Open' && onResolve && (
          <button
            onClick={onResolve}
            disabled={resolveLoading}
            className="flex items-center gap-1.5 px-4 py-2 border border-emerald-300 text-emerald-700 hover:bg-emerald-50 rounded-lg text-xs font-semibold transition disabled:opacity-60 shrink-0"
          >
            <CheckCircle2 size={14} />
            {resolveLoading ? 'Working...' : resolveLabel}
          </button>
        )}
      </div>
    </div>
  );
}
