import React, { useState } from 'react';
import MinistryLayout from '../../layouts/MinistryLayout';
import { Trophy } from 'lucide-react';
import { useJurisdictionOptions, useCounsellorPerformance } from '../../services/hooks';

// Ministry Analytics & Workflow Task 2D's backend counterpart
// (/api/admin/counsellors/performance/:jurisdictionId) is exact-jurisdiction
// scoped, not a descendant-subtree aggregate (a counsellor works exactly one
// jurisdiction) - so this page needs its own single-jurisdiction picker,
// distinct from Staff Management's Create Account form.
//
// "Heavily overburdened" threshold - no backend-defined threshold exists for
// this (documented judgment call): an active caseload of MORE THAN 10 is
// flagged. Chosen as a round number clearly above what one counsellor can
// realistically give sustained attention to alongside session/journal/chat
// monitoring for each case, per the Feature Catalog's counsellor workload
// concerns - not derived from any stated backend rule.
const OVERBURDENED_ACTIVE_CASES = 10;
const JURISDICTION_LEVELS = ['district', 'state', 'national'];

export default function CounsellorPerformance() {
  const [perfLevel, setPerfLevel] = useState('district');
  const [perfJurisdictionId, setPerfJurisdictionId] = useState('');
  const perfJurisdictionQuery = useJurisdictionOptions(perfLevel);
  const perfJurisdictionOptions = perfJurisdictionQuery.data?.jurisdictions || [];
  const performanceQuery = useCounsellorPerformance(perfJurisdictionId || undefined);
  const counsellors = performanceQuery.data?.counsellors || [];
  // Highest avgDistressPointDrop among counsellors with at least one
  // considered case - badged as top performer(s) below (ties all badged).
  const eligibleDrops = counsellors.filter((c) => c.avgDistressPointDrop !== null).map((c) => c.avgDistressPointDrop);
  const bestDrop = eligibleDrops.length > 0 ? Math.max(...eligibleDrops) : null;

  return (
    <MinistryLayout title="Performance & Efficacy">
      <div className="space-y-4">
        <div className="bg-white p-4 rounded-xl border border-gray-200/80 shadow-sm flex flex-wrap items-end gap-4">
          <div>
            <label className="text-[11px] font-bold text-gray-500 uppercase block mb-1">Jurisdiction Level</label>
            <select
              value={perfLevel}
              onChange={(e) => { setPerfLevel(e.target.value); setPerfJurisdictionId(''); }}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white min-w-[160px]"
            >
              {JURISDICTION_LEVELS.map((l) => <option key={l} value={l} className="capitalize">{l}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[11px] font-bold text-gray-500 uppercase block mb-1">Jurisdiction</label>
            <select
              value={perfJurisdictionId}
              onChange={(e) => setPerfJurisdictionId(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white min-w-[220px]"
            >
              <option value="">Select a jurisdiction...</option>
              {perfJurisdictionOptions.map((j) => <option key={j.jurisdictionId} value={j.jurisdictionId}>{j.name}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-3 text-[11px] text-gray-500 pb-2">
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-rose-400 inline-block" /> Overburdened ({'>'}{OVERBURDENED_ACTIVE_CASES} active cases)</span>
            <span className="flex items-center gap-1.5"><Trophy size={12} className="text-amber-500" /> Top efficacy this jurisdiction</span>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200/80 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#EBF4FA]/60 text-gray-600 text-[11px] uppercase tracking-wider font-semibold border-b border-gray-100">
                  <th className="py-3.5 px-6">Counsellor</th>
                  <th className="py-3.5 px-4">Active Cases</th>
                  <th className="py-3.5 px-6">Efficacy (avg. distress-point drop)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-xs">
                {!perfJurisdictionId ? (
                  <tr><td colSpan={3} className="py-8 text-center text-gray-400">Select a jurisdiction to view counsellor performance.</td></tr>
                ) : performanceQuery.loading ? (
                  <tr><td colSpan={3} className="py-8 text-center text-gray-400">Loading...</td></tr>
                ) : performanceQuery.error ? (
                  <tr><td colSpan={3} className="py-8 text-center text-rose-600">{performanceQuery.error}</td></tr>
                ) : counsellors.length === 0 ? (
                  <tr><td colSpan={3} className="py-8 text-center text-gray-400">No counsellors assigned to this jurisdiction.</td></tr>
                ) : counsellors.map((c) => {
                  const overburdened = c.activeCaseCount > OVERBURDENED_ACTIVE_CASES;
                  const isTopPerformer = bestDrop !== null && c.avgDistressPointDrop === bestDrop;
                  return (
                    <tr key={c.officialId} className={`hover:bg-gray-50/70 transition ${overburdened ? 'bg-rose-50/70' : ''}`}>
                      <td className="py-4 px-6 font-bold text-gray-800">
                        <span className="flex items-center gap-2">
                          {c.fullName || '-'}
                          {isTopPerformer && (
                            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-bold">
                              <Trophy size={11} /> Top Efficacy
                            </span>
                          )}
                        </span>
                      </td>
                      <td className="py-4 px-4">
                        <span className={`px-2.5 py-1 rounded text-[11px] font-bold ${overburdened ? 'bg-rose-100 text-rose-700' : 'text-gray-700'}`}>
                          {c.activeCaseCount}
                          {overburdened ? ' (Overburdened)' : ''}
                        </span>
                      </td>
                      <td className="py-4 px-6 text-gray-700">
                        {c.avgDistressPointDrop === null ? (
                          <span className="text-gray-400">No data yet</span>
                        ) : (
                          <>
                            {/* avgDistressPointDrop is positive-is-better (earliest score minus
                                latest, per the backend route's proxy) - a drop in distress reads
                                as improvement, so it's labelled explicitly rather than shown as a
                                bare signed number that could read backwards. */}
                            <span className={`font-bold ${c.avgDistressPointDrop > 0 ? 'text-emerald-600' : c.avgDistressPointDrop < 0 ? 'text-rose-600' : 'text-gray-700'}`}>
                              {c.avgDistressPointDrop > 0
                                ? `${c.avgDistressPointDrop} pt drop`
                                : c.avgDistressPointDrop < 0
                                ? `${Math.abs(c.avgDistressPointDrop)} pt increase`
                                : 'No change'}
                            </span>
                            <span className="text-gray-400"> ({c.victimsConsideredForEfficacy} case{c.victimsConsideredForEfficacy === 1 ? '' : 's'})</span>
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </MinistryLayout>
  );
}
