import React from 'react';
import { useNavigate } from 'react-router-dom';
import StaffLayout from '../layouts/StaffLayout';
import { CalendarClock, ArrowRight } from 'lucide-react';
import { useUpcomingHearings } from '../services/hooks';

// Cross-case view for hearing preparation - every upcoming hearing across
// this representative's own Active cases, soonest first. Sourced from each
// case's own eCourt data (the same simulated-eCourt-sync feed the victim's
// own Case Details screen shows), NOT this representative's own recorded
// hearing outcomes - those are the official record of a hearing already
// held (My Cases -> View -> Record Hearing Outcome), a different thing from
// "what's coming up on the court's own schedule".
export default function Hearings() {
  const navigate = useNavigate();
  const query = useUpcomingHearings();
  const hearings = query.data?.upcomingHearings || [];

  return (
    <StaffLayout title="Hearings">
      <div className="bg-white p-4 rounded-xl border border-gray-200/80 shadow-sm space-y-4">
        <div>
          <h3 className="font-bold text-sm text-gray-800">Upcoming Hearings</h3>
          <p className="text-[11px] text-gray-400">From each case's eCourt schedule, across every Legal Aid case currently assigned to you - for hearing preparation.</p>
        </div>

        <div className="border border-gray-200/80 rounded-xl overflow-hidden overflow-x-auto">
          {query.loading ? (
            <p className="text-sm text-gray-400 p-6">Loading...</p>
          ) : query.error ? (
            <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm px-4 py-3 m-4 rounded-lg">{query.error}</div>
          ) : hearings.length === 0 ? (
            <p className="text-sm text-gray-400 p-6">No upcoming hearings on the court schedule for your assigned cases.</p>
          ) : (
            <table className="w-full text-left min-w-[820px]">
              <thead>
                <tr className="bg-gray-50 text-[11px] font-bold text-gray-500 uppercase">
                  <th className="px-6 py-3">Docket Number</th>
                  <th className="px-6 py-3">Victim</th>
                  <th className="px-6 py-3">Case Type</th>
                  <th className="px-6 py-3">Case Stage</th>
                  <th className="px-6 py-3">Next Hearing</th>
                  <th className="px-6 py-3">Purpose</th>
                  <th className="px-6 py-3">Court</th>
                  <th className="px-6 py-3">Mode</th>
                  <th className="px-6 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {hearings.map((h) => (
                  <tr key={h.requestId} className="hover:bg-gray-50/70 transition">
                    <td className="px-6 py-3.5 text-sm font-bold text-gray-800">{h.docketNumber}</td>
                    <td className="px-6 py-3.5 text-xs text-gray-600">{h.victimName || '—'}</td>
                    <td className="px-6 py-3.5 text-xs text-gray-500">{h.caseTypeName || '—'}</td>
                    <td className="px-6 py-3.5 text-xs text-gray-500">{h.caseStage || '—'}</td>
                    <td className="px-6 py-3.5 text-xs text-gray-700 font-semibold">
                      <span className="flex items-center gap-1.5">
                        <CalendarClock size={13} className="text-[#3D5A80]" />
                        {new Date(h.nextHearingDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </span>
                    </td>
                    <td className="px-6 py-3.5 text-xs text-gray-500">{h.nextHearingPurpose || '—'}</td>
                    <td className="px-6 py-3.5 text-xs text-gray-500">{h.court || '—'}{h.courtNumber ? ` (Court No. ${h.courtNumber})` : ''}</td>
                    <td className="px-6 py-3.5 text-xs text-gray-500">{h.hearingMode || '—'}</td>
                    <td className="px-6 py-3.5 text-right">
                      <button
                        onClick={() => navigate(`/legalrepresentative/cases/${h.requestId}`)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-[#519BCE] text-[#519BCE] hover:bg-[#519BCE] hover:text-white rounded-md text-xs font-semibold transition"
                      >
                        View Case <ArrowRight size={13} />
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
