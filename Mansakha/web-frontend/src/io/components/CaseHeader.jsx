import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, CheckCircle2 } from 'lucide-react';

// Shared summary bar (Docket/Case Type/Case Stage/Threat Tier + Mark
// Investigation Complete) reused across Overview/Activity Log/Tasks. NOT a
// copy of ReferralHeader.jsx's Open/Resolved status model - this role has
// no referral to resolve, only its own investigation to close out.

const STAGE_BADGE = {
  Investigation: 'bg-amber-100 text-amber-700',
  Trial: 'bg-sky-100 text-sky-700',
  Compensation: 'bg-indigo-100 text-indigo-700',
  'Case Closed': 'bg-gray-100 text-gray-600',
  Rehabilitation: 'bg-emerald-100 text-emerald-700',
};

const THREAT_TIER_BADGE = {
  Routine: 'bg-gray-100 text-gray-600',
  Guarded: 'bg-yellow-100 text-yellow-700',
  Elevated: 'bg-orange-100 text-orange-700',
  Severe: 'bg-rose-100 text-rose-700',
};

export default function CaseHeader({ c, backTo, backLabel, onMarkComplete, markCompleteLoading }) {
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
            <span className="text-base font-bold text-gray-800">{c.docketNumber}</span>
          </div>
          <div>
            <span className="text-[10px] font-bold tracking-wider text-gray-400 uppercase block">Case Type</span>
            <span className="text-xs font-bold text-gray-700">{c.caseTypeName}</span>
          </div>
          <div>
            <span className="text-[10px] font-bold tracking-wider text-gray-400 uppercase block mb-1">Case Stage</span>
            <span className={`text-xs font-bold px-2.5 py-0.5 rounded ${STAGE_BADGE[c.caseStage] || 'bg-gray-100 text-gray-600'}`}>{c.caseStage}</span>
          </div>
          <div>
            <span className="text-[10px] font-bold tracking-wider text-gray-400 uppercase block mb-1">Threat Tier</span>
            {c.threatTier ? (
              <span className={`text-xs font-bold px-2.5 py-0.5 rounded ${THREAT_TIER_BADGE[c.threatTier] || 'bg-gray-100 text-gray-600'}`}>{c.threatTier}</span>
            ) : (
              <span className="text-xs text-gray-400">Not yet assessed</span>
            )}
          </div>
        </div>
        {c.caseStage === 'Investigation' && !c.investigationCompleteAt && onMarkComplete && (
          <button
            onClick={onMarkComplete}
            disabled={markCompleteLoading}
            className="flex items-center gap-1.5 px-4 py-2 border border-emerald-300 text-emerald-700 hover:bg-emerald-50 rounded-lg text-xs font-semibold transition disabled:opacity-60 shrink-0"
          >
            <CheckCircle2 size={14} />
            {markCompleteLoading ? 'Working...' : 'Mark Investigation Complete'}
          </button>
        )}
      </div>
    </div>
  );
}
