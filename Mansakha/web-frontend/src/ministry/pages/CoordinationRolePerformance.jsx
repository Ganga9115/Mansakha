import React from 'react';
import MinistryLayout from '../layouts/MinistryLayout';
import { AlertTriangle } from 'lucide-react';
import { useCoordinationRolePerformanceMinistry, useCoordinationStaffingGapsMinistry } from '../services/hooks';

// Section B (workforce data) - Ministry's own fuller version of District/
// State/National Admin's own "Coordination Roster" page, covering all 6
// coordination roles including Rehabilitation Officer. RO is scoped by a
// rehabilitation_provider (migration_031), not a jurisdiction or police
// station - which has no honest place in the admin-tier pages' own
// jurisdiction-scoped view, but is exactly Ministry's own domain, since
// Ministry already manages providers via Staff Management. No jurisdiction
// picker needed - Ministry is unrestricted (Section 3), so this is always
// the real, whole-country roster.

// Every name is real, actionable data - a nationwide gap list can run into
// the hundreds of districts, so this caps the BOX HEIGHT (a scrollable
// list), never the data itself. An earlier version truncated the text with
// "+N more" and no way to see the rest - fixed per direct feedback that
// hiding the tail of an actionable list isn't acceptable.
function GapList({ names }) {
  if (names.length === 0) return <span className="text-emerald-600 font-semibold">Fully staffed</span>;
  return (
    <div className="flex-1 min-w-0">
      <span className="text-[10px] font-bold text-gray-400 block mb-1">{names.length} unstaffed</span>
      <div className="max-h-24 overflow-y-auto text-gray-600 leading-relaxed pr-1">{names.join(', ')}</div>
    </div>
  );
}

export default function CoordinationRolePerformance() {
  const perfQuery = useCoordinationRolePerformanceMinistry();
  const gapsQuery = useCoordinationStaffingGapsMinistry();
  const officials = perfQuery.data?.officials || [];
  const roleGaps = gapsQuery.data?.roleGaps || [];
  const stationGaps = gapsQuery.data?.stationGaps || [];
  const providerGaps = gapsQuery.data?.providerGaps || [];

  return (
    <MinistryLayout title="Coordination Roster">
      <div className="space-y-4">
        <div className="bg-white p-4 rounded-xl border border-gray-200/80 shadow-sm">
          <h3 className="font-bold text-sm text-gray-800">Coordination Roster</h3>
          <p className="text-[11px] text-gray-400 mt-1">
            Which officials hold each of the 6 coordination roles nationwide - Protection Officer, District Welfare
            Officer, DLSA Coordinator, District Collector, Investigating Officer and Rehabilitation Officer - and how
            their own referral queue is actually moving.
          </p>
        </div>

        <div className="bg-white rounded-xl border border-gray-200/80 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#EBF4FA]/60 text-gray-600 text-[11px] uppercase tracking-wider font-semibold border-b border-gray-100">
                  <th className="py-3.5 px-6">Official</th>
                  <th className="py-3.5 px-4">Role</th>
                  <th className="py-3.5 px-4">Scope</th>
                  <th className="py-3.5 px-4">Open</th>
                  <th className="py-3.5 px-4">Resolved</th>
                  <th className="py-3.5 px-6">Avg. Resolve Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-xs">
                {perfQuery.loading ? (
                  <tr><td colSpan={6} className="py-8 text-center text-gray-400">Loading...</td></tr>
                ) : perfQuery.error ? (
                  <tr><td colSpan={6} className="py-8 text-center text-rose-600">{perfQuery.error}</td></tr>
                ) : officials.length === 0 ? (
                  <tr><td colSpan={6} className="py-8 text-center text-gray-400">No coordination-role officials assigned yet.</td></tr>
                ) : officials.map((o) => (
                  <tr key={o.officialId} className="hover:bg-gray-50/70 transition">
                    <td className="py-4 px-6 font-bold text-gray-800">
                      {o.fullName}
                      {o.designation && <span className="block text-[10px] font-normal text-gray-400">{o.designation}</span>}
                    </td>
                    <td className="py-4 px-4 text-gray-700">{o.roleName}</td>
                    <td className="py-4 px-4 text-gray-600">{o.stationName || o.providerName || o.jurisdictionName || '-'}</td>
                    <td className="py-4 px-4">
                      <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${o.openReferralCount > 0 ? 'bg-amber-100 text-amber-700' : 'text-gray-500'}`}>{o.openReferralCount}</span>
                    </td>
                    <td className="py-4 px-4 text-gray-700">{o.resolvedReferralCount}</td>
                    <td className="py-4 px-6 text-gray-700">{o.avgResolveDays !== null ? `${o.avgResolveDays}d` : <span className="text-gray-400">No data yet</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl border border-gray-200/80 shadow-sm space-y-3">
          <div className="flex items-center gap-1.5">
            <AlertTriangle size={15} className="text-amber-600" />
            <h3 className="font-bold text-sm text-gray-800">Staffing Gaps</h3>
          </div>
          <p className="text-[11px] text-gray-400">
            Districts with no official at all holding a given role, police stations with no Investigating Officer, and
            rehabilitation providers with no Rehabilitation Officer.
          </p>
          {gapsQuery.loading ? (
            <p className="text-xs text-gray-400">Loading...</p>
          ) : (
            <div className="space-y-2 text-xs">
              {roleGaps.map((g) => (
                <div key={g.roleName} className="flex items-start gap-2">
                  <span className="w-48 shrink-0 font-semibold text-gray-700">{g.roleName}</span>
                  <GapList names={g.unassignedJurisdictions.map((j) => j.name)} />
                </div>
              ))}
              <div className="flex items-start gap-2 pt-2 border-t border-gray-100">
                <span className="w-48 shrink-0 font-semibold text-gray-700">Investigating Officer (stations)</span>
                <GapList names={stationGaps.map((s) => `${s.name} (${s.jurisdictionName})`)} />
              </div>
              <div className="flex items-start gap-2 pt-2 border-t border-gray-100">
                <span className="w-48 shrink-0 font-semibold text-gray-700">Rehabilitation Officer (providers)</span>
                <GapList names={providerGaps.map((p) => `${p.name} (${p.providerType})`)} />
              </div>
            </div>
          )}
        </div>
      </div>
    </MinistryLayout>
  );
}
