import React, { useState } from 'react';
import StaffLayout from '../layouts/StaffLayout';
import { Search, Send, Users2 } from 'lucide-react';
import { useSearchUserByDocket, useCaseAgencyReferrals, useCreateAgencyReferral } from '../services/hooks';

// Agency Coordination - the ONE new District Admin page this whole feature
// adds. Looks up a case by docket (reusing the existing GET /users search),
// then optionally creates a referral into one of the 7 new coordination
// roles' queues. This is purely additive: it never touches the existing
// Intervention Requests Accept/Reject flow, and District Admin remains the
// only decision-maker there - a referral here is a follow-up action AFTER
// a decision has already been made, not a competing approval chain.

// Investigating Officer and Special Public Prosecutor were retired as
// separate logins - trimmed here too so this picker can't target a queue
// nobody can see. District Collector removed the same way - no official
// holds that role any more.
const REFERRAL_ROLES = [
  'District Welfare Officer',
  'Protection Officer',
  'DLSA Coordinator',
  'Rehabilitation Officer',
];

const STATUS_BADGE = { Open: 'bg-amber-100 text-amber-700', Resolved: 'bg-emerald-100 text-emerald-700' };

export default function AgencyCoordination() {
  const [docketNumber, setDocketNumber] = useState('');
  const [foundUser, setFoundUser] = useState(null);
  const [searchError, setSearchError] = useState(null);
  const [referredToRole, setReferredToRole] = useState(REFERRAL_ROLES[0]);
  const [reason, setReason] = useState('');
  const [createError, setCreateError] = useState(null);
  const [createSuccess, setCreateSuccess] = useState(null);

  const search = useSearchUserByDocket();
  const create = useCreateAgencyReferral();
  const referralsQuery = useCaseAgencyReferrals(foundUser?.userId);

  const handleSearch = async (e) => {
    e.preventDefault();
    setSearchError(null);
    setFoundUser(null);
    try {
      const result = await search.mutate(docketNumber.trim());
      setFoundUser(result.user);
    } catch (err) {
      setSearchError(err.message || 'Case not found.');
    }
  };

  const handleCreateReferral = async (e) => {
    e.preventDefault();
    setCreateError(null);
    setCreateSuccess(null);
    try {
      await create.mutate(foundUser.userId, referredToRole, reason.trim());
      setCreateSuccess(`Referral created to ${referredToRole}.`);
      setReason('');
      referralsQuery.refetch();
    } catch (err) {
      setCreateError(err.message || 'Could not create referral.');
    }
  };

  return (
    <StaffLayout title="Agency Coordination">
      <div className="space-y-4 max-w-2xl">
        <div className="bg-white p-4 rounded-xl border border-gray-200/80 shadow-sm space-y-4">
          <div>
            <h3 className="font-bold text-sm text-gray-800">Look Up a Case</h3>
            <p className="text-[11px] text-gray-400">Find a case by docket number, then optionally loop in one of the coordination roles - Welfare, Protection, Legal Aid, or Rehabilitation.</p>
          </div>

          <form onSubmit={handleSearch} className="flex items-center gap-2">
            <input
              type="text"
              value={docketNumber}
              onChange={(e) => setDocketNumber(e.target.value)}
              placeholder="Docket number (e.g. DOC-868554)"
              required
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
            <button type="submit" disabled={search.loading} className="flex items-center gap-1.5 px-4 py-2 bg-brand-700 hover:bg-brand-800 text-white rounded-lg text-sm font-semibold transition disabled:opacity-60">
              <Search size={15} />
              {search.loading ? 'Searching...' : 'Search'}
            </button>
          </form>

          {searchError && <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs px-3 py-2 rounded-lg">{searchError}</div>}
        </div>

        {foundUser && (
          <div className="bg-white p-4 rounded-xl border border-gray-200/80 shadow-sm space-y-4">
            <div>
              <h3 className="font-bold text-sm text-gray-800">{foundUser.docketNumber}</h3>
              <p className="text-[11px] text-gray-400">Case stage: {foundUser.caseStage || 'Unknown'} - Status: {foundUser.status}</p>
            </div>

            <div>
              <p className="text-[11px] font-bold text-gray-500 uppercase mb-1.5">Existing Referrals</p>
              {referralsQuery.loading ? (
                <p className="text-xs text-gray-400">Loading...</p>
              ) : referralsQuery.data?.referrals?.length > 0 ? (
                <div className="space-y-1.5">
                  {referralsQuery.data.referrals.map((r) => (
                    <div key={r.referralId} className="flex items-center justify-between border border-gray-200 rounded-lg px-3 py-2 text-xs">
                      <div>
                        <span className="font-bold text-gray-800">{r.referredToRole}</span>
                        {r.reason && <span className="text-gray-500"> - {r.reason}</span>}
                      </div>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${STATUS_BADGE[r.status] || 'bg-gray-100 text-gray-600'}`}>{r.status}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-gray-400">No referrals yet for this case.</p>
              )}
            </div>

            <form onSubmit={handleCreateReferral} className="space-y-3 pt-2 border-t border-gray-100">
              <p className="text-[11px] font-bold text-gray-500 uppercase">Create a New Referral</p>

              <div className="flex flex-wrap gap-2">
                {REFERRAL_ROLES.map((role) => (
                  <button
                    key={role}
                    type="button"
                    onClick={() => setReferredToRole(role)}
                    className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold transition border ${
                      referredToRole === role ? 'bg-brand-800 text-white border-brand-900' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    {role}
                  </button>
                ))}
              </div>

              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Why are you looping in this agency? (optional context)"
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />

              {createError && <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs px-3 py-2 rounded-lg">{createError}</div>}
              {createSuccess && <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs px-3 py-2 rounded-lg">{createSuccess}</div>}

              <button type="submit" disabled={create.loading} className="flex items-center gap-1.5 px-4 py-2 bg-brand-800 hover:bg-[#1a1d45] text-white rounded-lg text-sm font-semibold transition disabled:opacity-60">
                <Send size={15} />
                {create.loading ? 'Creating...' : 'Create Referral'}
              </button>
            </form>
          </div>
        )}

        {!foundUser && (
          <div className="bg-white p-8 rounded-xl border border-gray-200/80 shadow-sm text-center text-gray-400">
            <Users2 size={28} className="mx-auto mb-2" />
            <p className="text-sm">Search for a case to see its referral history and loop in an agency.</p>
          </div>
        )}
      </div>
    </StaffLayout>
  );
}
