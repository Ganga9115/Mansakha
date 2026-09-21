import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import StaffLayout from '../layouts/StaffLayout';
import { ArrowLeft, CheckCircle2, Send, ClipboardList } from 'lucide-react';
import { useReferralDetail, useAddReferralNote, useResolveReferral } from '../services/hooks';


// Assign a structured, trackable action item to any concerned office for
// this case - always-visible card on the Detail page. Mirrors
// dwo/pages/ReferralDetail.jsx's identical component.
// No "Assign Action Item" here either. The District Collector's authority
// under the PoA Act is exercised through the district Vigilance and
// Monitoring Committee the DM chairs - reviewed case by case, decision
// recorded - which is exactly what this Review Detail already is (notes +
// resolve). A free-text task aimed at any of six offices is not that
// mechanism, and some of what it allowed was wrong outright: a Collector
// cannot direct an Investigating Officer, since investigation is the
// police's own domain under the CrPC, supervised by the SP.
//
// agency_tasks still matters - but only the SYSTEM writes to it now
// (core/services/agencyEscalationChecker.js escalates stalled cases UP to
// this role). My Tasks stays for exactly that reason: it is this role's
// escalation inbox, not a peer-to-peer task list.
function OtherReferralCard({ r }) {
  return (
    <div className="border border-gray-200 rounded-lg p-3.5">
      <div className="flex items-center gap-2 flex-wrap mb-1.5">
        <p className="font-bold text-gray-800 text-xs">{r.referredToRole}</p>
        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${STATUS_BADGE[r.status] || 'bg-gray-100 text-gray-600'}`}>{r.status}</span>
      </div>
      {r.reason && <p className="text-xs text-gray-500 mb-2">{r.reason}</p>}
      {r.notes.length > 0 ? (
        <div className="space-y-1.5">
          {r.notes.map((n) => (
            <div key={n.noteId} className="bg-gray-50 rounded p-2">
              <p className="text-xs whitespace-pre-wrap">{n.noteText}</p>
              <p className="text-[10px] text-gray-400 mt-0.5">{n.authorName} - {new Date(n.createdAt).toLocaleString()}</p>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-gray-400 italic">No notes logged by this agency yet.</p>
      )}
    </div>
  );
}

// District Collector's Review Detail - the full case record for one
// escalation: context, every other agency's work on the same case, the
// directive log, and every action (Close Review, Assign Task), laid out as
// proper sections rather than crammed into an accordion. THE genuinely
// unique page across the 7 roles - the cross-agency card is what gives DC
// its committee-oversight capability. Structurally mirrors
// dwo/pages/ReferralDetail.jsx's header-summary + card-grid convention.

const STATUS_BADGE = { Open: 'bg-amber-100 text-amber-700', Resolved: 'bg-emerald-100 text-emerald-700' };

export default function ReviewDetail() {
  const { referralId } = useParams();
  const navigate = useNavigate();
  const [noteText, setNoteText] = useState('');
  const [actionError, setActionError] = useState(null);
  const detailQuery = useReferralDetail(referralId);
  const addNote = useAddReferralNote();
  const resolve = useResolveReferral();

  const r = detailQuery.data;

  if (detailQuery.loading) {
    return <StaffLayout title="Review Detail"><p className="text-sm text-gray-400">Loading...</p></StaffLayout>;
  }
  if (detailQuery.error || !r) {
    return (
      <StaffLayout title="Review Detail">
        <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm px-4 py-3 rounded-lg">
          {detailQuery.error || 'This review could not be located.'}
        </div>
      </StaffLayout>
    );
  }

  const handleAddNote = async () => {
    if (!noteText.trim()) return;
    setActionError(null);
    try {
      await addNote.mutate(referralId, noteText.trim());
      setNoteText('');
      detailQuery.refetch();
    } catch (err) {
      setActionError(err.message || 'Could not log directive. Kindly try again.');
    }
  };

  const handleResolve = async () => {
    setActionError(null);
    try {
      await resolve.mutate(referralId);
      navigate('/districtcollector');
    } catch (err) {
      setActionError(err.message || 'Could not close this review. Kindly try again.');
    }
  };

  return (
    <StaffLayout title="Review Detail">
      <div className="space-y-6">
        <button onClick={() => navigate('/districtcollector')} className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-gray-700 transition">
          <ArrowLeft size={14} /> Back to Committee Review
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
              <span className="text-[10px] font-bold tracking-wider text-gray-400 uppercase block">Escalated On</span>
              <span className="text-xs font-bold text-gray-700">{new Date(r.createdAt).toLocaleString()}</span>
            </div>
          </div>
          {r.status === 'Open' && (
            <button
              onClick={handleResolve}
              disabled={resolve.loading}
              className="flex items-center gap-1.5 px-4 py-2 border border-emerald-300 text-emerald-700 hover:bg-emerald-50 rounded-lg text-xs font-semibold transition disabled:opacity-60 shrink-0"
            >
              <CheckCircle2 size={14} />
              {resolve.loading ? 'Working...' : 'Close Review'}
            </button>
          )}
        </div>

        {actionError && <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs px-4 py-3 rounded-lg">{actionError}</div>}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            {r.reason && (
              <div className="bg-white p-6 rounded-xl border border-gray-200/80 shadow-sm">
                <h3 className="font-bold text-sm text-gray-800 mb-3">Why This Was Escalated</h3>
                <p className="text-xs text-gray-600 whitespace-pre-wrap leading-relaxed">{r.reason}</p>
              </div>
            )}

            <div className="bg-white p-6 rounded-xl border border-gray-200/80 shadow-sm">
              <h3 className="font-bold text-sm text-gray-800 mb-1">Every Agency Working This Case</h3>
              <p className="text-[11px] text-gray-400 mb-4">Read-only. District Admin keeps sole decision authority on every case regardless of anything logged here.</p>
              {r.otherAgencyReferrals?.length > 0 ? (
                <div className="space-y-3">
                  {r.otherAgencyReferrals.map((r2) => <OtherReferralCard key={r2.referralId} r={r2} />)}
                </div>
              ) : (
                <p className="text-xs text-gray-400">No other agency has been referred on this case.</p>
              )}
            </div>

            <div className="bg-white p-6 rounded-xl border border-gray-200/80 shadow-sm">
              <h3 className="font-bold text-sm text-gray-800 mb-4">Directives</h3>
              {r.notes?.length > 0 ? (
                <div className="space-y-3 mb-4">
                  {r.notes.map((n) => (
                    <div key={n.noteId} className="border border-gray-200 rounded-lg p-3">
                      <p className="text-xs text-gray-700 whitespace-pre-wrap leading-relaxed">{n.noteText}</p>
                      <p className="text-[10px] text-gray-400 mt-1.5">{n.authorName} - {new Date(n.createdAt).toLocaleString()}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-gray-400 mb-4">No directives have been issued yet.</p>
              )}

              {r.status === 'Open' && (
                <div className="flex items-center gap-2 pt-4 border-t border-gray-100">
                  <input
                    type="text"
                    value={noteText}
                    onChange={(e) => setNoteText(e.target.value)}
                    placeholder="Log a directive..."
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-xs"
                  />
                  <button
                    onClick={handleAddNote}
                    disabled={!noteText.trim() || addNote.loading}
                    className="flex items-center gap-1.5 px-4 py-2 bg-blue-700 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold transition disabled:opacity-60 shrink-0"
                  >
                    <Send size={13} />
                    {addNote.loading ? 'Logging...' : 'Log Directive'}
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-6">
          </div>
        </div>
      </div>
    </StaffLayout>
  );
}
