import React, { useState } from 'react';
import MinistryLayout from '../layouts/MinistryLayout';
import { AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react';
import { useCoordinationRolePerformanceMinistry, useCoordinationStaffingGapsMinistry } from '../services/hooks';
import GlideSelect from '../../shared/components/GlideSelect';

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

// "X/Y staffed (Z%)" - the raw gap list above answers "which ones", this
// answers "how bad is it" without making the reader count the list or guess
// the size of the subtree it's drawn from.
function CoverageBadge({ staffedCount, total, pct }) {
  if (total === 0) return null;
  const tone = pct === 100 ? 'text-emerald-600' : pct >= 50 ? 'text-amber-600' : 'text-rose-600';
  return <span className={`text-[10px] font-bold ${tone}`}>{staffedCount}/{total} staffed ({pct}%)</span>;
}

// A bare "6 open" is a dead end - this turns it into the actual worklist
// behind the count (docket number, case type, current risk level, days
// open), with anything past the system's own real 7-day escalation
// threshold flagged, not a separately-invented number.
function OpenReferralsDrilldown({ openReferrals }) {
  if (openReferrals.length === 0) {
    return <p className="text-xs text-gray-400 py-3 px-6">No open referrals in this queue.</p>;
  }
  return (
    <div className="px-6 py-3 space-y-1.5 max-h-64 overflow-y-auto">
      {openReferrals.map((r) => (
        <div key={r.referralId} className={`flex items-center gap-3 text-xs px-3 py-2 rounded-lg ${r.overdue ? 'bg-rose-50' : 'bg-gray-50'}`}>
          <span className="font-bold text-gray-700 w-24 shrink-0 truncate">Docket {r.docketNumber}</span>
          <span className="text-gray-600 flex-1 min-w-0 truncate">{r.caseType}</span>
          {r.riskLevel && <span className="text-gray-500 shrink-0">{r.riskLevel} risk</span>}
          <span className={`shrink-0 font-semibold ${r.overdue ? 'text-rose-600' : 'text-gray-500'}`}>
            {r.daysOpen === 0 ? 'Opened today' : `${r.daysOpen}d open`}{r.overdue ? ' · overdue' : ''}
          </span>
        </div>
      ))}
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
  const stationCoverage = gapsQuery.data?.stationCoverage || { totalStations: 0, staffedCount: 0, coveragePct: null };
  const providerCoverage = gapsQuery.data?.providerCoverage || { totalProviders: 0, staffedCount: 0, coveragePct: null };
  const [expandedId, setExpandedId] = useState(null);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('All Roles');
  const [stateFilter, setStateFilter] = useState('All States');

  // Hardcoded, not derived from officials - a role with zero people
  // currently holding it (e.g. Rehabilitation Officer, per the Staffing
  // Gaps card above) should still be selectable, not silently disappear
  // from the filter just because nobody has been assigned to it yet.
  const roleOptions = ['All Roles', 'Protection Officer', 'District Welfare Officer', 'DLSA Coordinator', 'Investigating Officer', 'Rehabilitation Officer'];
  const stateOptions = ['All States', ...Array.from(new Set(officials.map((o) => o.stateName).filter(Boolean))).sort()];

  const filteredOfficials = officials.filter((o) => {
    if (roleFilter !== 'All Roles' && o.roleName !== roleFilter) return false;
    if (stateFilter !== 'All States' && o.stateName !== stateFilter) return false;
    if (search.trim()) {
      const haystack = [o.fullName, o.designation, o.roleName, o.stationName, o.providerName, o.jurisdictionName, o.stateName]
        .filter(Boolean).join(' ').toLowerCase();
      if (!haystack.includes(search.trim().toLowerCase())) return false;
    }
    return true;
  });

  return (
    <MinistryLayout title="Coordination Roster">
      <div className="space-y-4">
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
              {[
                ...roleGaps.map((g) => ({
                  key: g.roleName,
                  label: g.roleName,
                  names: g.unassignedJurisdictions.map((j) => j.name),
                  staffedCount: g.staffedCount,
                  total: g.totalDistricts,
                  pct: g.coveragePct,
                })),
                {
                  key: 'io-stations',
                  label: 'Investigating Officer (stations)',
                  names: stationGaps.map((s) => `${s.name} (${s.jurisdictionName})`),
                  staffedCount: stationCoverage.staffedCount,
                  total: stationCoverage.totalStations,
                  pct: stationCoverage.coveragePct,
                },
                {
                  key: 'ro-providers',
                  label: 'Rehabilitation Officer (providers)',
                  names: providerGaps.map((p) => `${p.name} (${p.providerType})`),
                  staffedCount: providerCoverage.staffedCount,
                  total: providerCoverage.totalProviders,
                  pct: providerCoverage.coveragePct,
                },
              ]
                // Worst-staffed first - a nationwide roster is mostly full
                // rows, so the actual gaps someone needs to act on would
                // otherwise sit buried below several "Fully staffed" rows.
                .sort((a, b) => (a.pct ?? 100) - (b.pct ?? 100))
                .map((row, i) => (
                  <div key={row.key} className={`flex items-start gap-2 ${i > 0 ? 'pt-2 border-t border-gray-100' : ''}`}>
                    <span className="w-48 shrink-0 font-semibold text-gray-700">{row.label}</span>
                    <GapList names={row.names} />
                    <CoverageBadge staffedCount={row.staffedCount} total={row.total} pct={row.pct} />
                  </div>
                ))}
            </div>
          )}
        </div>

        <div className="bg-white p-4 rounded-xl border border-gray-200/80 shadow-sm">
          <h3 className="font-bold text-sm text-gray-800">Coordination Roster</h3>
          <p className="text-[11px] text-gray-400 mt-1">
            Which officials hold each of the 5 coordination roles nationwide - Protection Officer, District Welfare
            Officer, DLSA Coordinator, Investigating Officer and Rehabilitation Officer - and how
            their own referral queue is actually moving. Click a row to see the actual open cases behind its count.
          </p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-gray-200/80 shadow-sm flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, designation, district, or state..."
            className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-xs text-gray-700 focus:outline-none focus:ring-1 focus:ring-brand-600"
          />
          <GlideSelect
            options={roleOptions}
            value={roleFilter}
            onChange={(val) => setRoleFilter(val)}
            ariaLabel="Role filter"
          />
          <GlideSelect
            options={stateOptions}
            value={stateFilter}
            onChange={(val) => setStateFilter(val)}
            ariaLabel="State filter"
          />
        </div>

        <div className="bg-white rounded-xl border border-gray-200/80 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-brand-50/60 text-gray-600 text-[11px] uppercase tracking-wider font-semibold border-b border-gray-100">
                  <th className="py-3.5 px-6 w-8"></th>
                  <th className="py-3.5 px-2">Official</th>
                  <th className="py-3.5 px-4">Role</th>
                  <th className="py-3.5 px-4">Scope</th>
                  <th className="py-3.5 px-4">Open</th>
                  <th className="py-3.5 px-4">Resolved</th>
                  <th className="py-3.5 px-6">Avg. Resolve Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-xs">
                {perfQuery.loading ? (
                  <tr><td colSpan={7} className="py-8 text-center text-gray-400">Loading...</td></tr>
                ) : perfQuery.error ? (
                  <tr><td colSpan={7} className="py-8 text-center text-rose-600">{perfQuery.error}</td></tr>
                ) : officials.length === 0 ? (
                  <tr><td colSpan={7} className="py-8 text-center text-gray-400">No coordination-role officials assigned yet.</td></tr>
                ) : filteredOfficials.length === 0 ? (
                  <tr><td colSpan={7} className="py-8 text-center text-gray-400">No officials match your search or filters.</td></tr>
                ) : filteredOfficials.map((o) => {
                  const isExpanded = expandedId === o.officialId;
                  return (
                    <React.Fragment key={o.officialId}>
                      <tr
                        className="hover:bg-gray-50/70 transition cursor-pointer"
                        onClick={() => setExpandedId(isExpanded ? null : o.officialId)}
                      >
                        <td className="py-4 px-6 text-gray-400">
                          {o.openReferralCount > 0 && (isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />)}
                        </td>
                        <td className="py-4 px-2 font-bold text-gray-800">
                          {o.fullName}
                          {o.designation && <span className="block text-[10px] font-normal text-gray-400">{o.designation}</span>}
                        </td>
                        <td className="py-4 px-4 text-gray-700">{o.roleName}</td>
                        <td className="py-4 px-4 text-gray-600">{o.stationName || o.providerName || o.jurisdictionName || '-'}</td>
                        <td className="py-4 px-4">
                          <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${o.openReferralCount > 0 ? 'bg-amber-100 text-amber-700' : 'text-gray-500'}`}>{o.openReferralCount}</span>
                          {o.overdueOpenCount > 0 && <span className="ml-1.5 text-[11px] font-bold text-rose-600">{o.overdueOpenCount} overdue</span>}
                        </td>
                        <td className="py-4 px-4 text-gray-700">{o.resolvedReferralCount}</td>
                        <td className="py-4 px-6 text-gray-700">{o.avgResolveDays !== null ? `${o.avgResolveDays}d` : <span className="text-gray-400">No data yet</span>}</td>
                      </tr>
                      {isExpanded && (
                        <tr>
                          <td colSpan={7} className="bg-gray-50/60 border-t border-gray-100">
                            <OpenReferralsDrilldown openReferrals={o.openReferrals || []} />
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
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
