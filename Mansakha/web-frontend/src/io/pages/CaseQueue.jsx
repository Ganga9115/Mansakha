import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePageHeader } from '../../shared/context/PageHeaderContext';
import { ArrowRight } from 'lucide-react';
import { useCasesList } from '../services/hooks';

// Investigating Officer's Case Queue - every case assigned to this
// officer's own police station (not a District-Admin-created referral like
// every other new-role portal). "Active" = case_stage is still
// Investigation; "Handed Off" = the (simulated) eCourt system has since
// moved the case to Trial or beyond, kept visible read-only rather than
// disappearing from view. migration_034: this split now tracks case_stage
// directly, independent of whether IO has filed a chargesheet - filing one
// no longer advances case_stage itself.

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

export default function CaseQueue() {
  usePageHeader({ title: 'Case Queue' });
  const navigate = useNavigate();
  const [tab, setTab] = useState('Active');
  const query = useCasesList(tab);
  const cases = query.data?.cases || [];
  const stationAssigned = query.data?.stationAssigned !== false;

  return (
    <>
      <div className="space-y-4">
        <div className="bg-white p-4 rounded-xl border border-gray-200/80 shadow-sm space-y-4">
          <div>
            <h3 className="font-bold text-sm text-gray-800">My Station's Cases</h3>
            <p className="text-[11px] text-gray-400">Every case whose FIR was registered at your assigned police station. Select a case to investigate.</p>
          </div>

          {!stationAssigned ? (
            <div className="bg-amber-50 border border-amber-200 text-amber-700 text-sm px-4 py-3 rounded-lg">
              No police station is assigned to your account yet. Kindly contact Ministry.
            </div>
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                {['Active', 'HandedOff'].map((s) => (
                  <button
                    key={s}
                    onClick={() => setTab(s)}
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition ${
                      tab === s ? 'bg-brand-700 text-white shadow-sm' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    {s === 'Active' ? 'Active' : 'Handed Off'}
                  </button>
                ))}
              </div>

              <div className="border border-gray-200/80 rounded-xl overflow-hidden overflow-x-auto">
                {query.loading ? (
                  <p className="text-sm text-gray-400 p-6">Loading...</p>
                ) : query.error ? (
                  <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm px-4 py-3 m-4 rounded-lg">{query.error}</div>
                ) : cases.length === 0 ? (
                  <p className="text-sm text-gray-400 p-6">No {tab === 'Active' ? 'active' : 'handed off'} cases.</p>
                ) : (
                  <table className="w-full text-left min-w-[720px]">
                    <thead>
                      <tr className="bg-gray-50 text-[11px] font-bold text-gray-500 uppercase">
                        <th className="px-6 py-3">Docket Number</th>
                        <th className="px-6 py-3">Case Type</th>
                        <th className="px-6 py-3">Case Stage</th>
                        <th className="px-6 py-3">Chargesheet</th>
                        <th className="px-6 py-3">Threat Tier</th>
                        <th className="px-6 py-3 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {cases.map((c) => (
                        <tr key={c.userId} className="hover:bg-gray-50/70 transition">
                          <td className="px-6 py-3.5 text-sm font-bold text-gray-800">{c.docketNumber}</td>
                          <td className="px-6 py-3.5 text-xs text-gray-500">{c.caseTypeName}</td>
                          <td className="px-6 py-3.5">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${STAGE_BADGE[c.caseStage] || 'bg-gray-100 text-gray-600'}`}>{c.caseStage}</span>
                          </td>
                          <td className="px-6 py-3.5 text-xs text-gray-500">{c.chargesheetStatus}</td>
                          <td className="px-6 py-3.5">
                            {c.threatTier ? (
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${THREAT_TIER_BADGE[c.threatTier] || 'bg-gray-100 text-gray-600'}`}>{c.threatTier}</span>
                            ) : (
                              <span className="text-[10px] text-gray-400">Not yet assessed</span>
                            )}
                          </td>
                          <td className="px-6 py-3.5 text-right">
                            <button
                              onClick={() => navigate(`/io/cases/${c.userId}`)}
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
            </>
          )}
        </div>
      </div>
    </>
  );
}
