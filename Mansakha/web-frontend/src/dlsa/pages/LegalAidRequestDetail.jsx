import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import StaffLayout from '../layouts/StaffLayout';
import { ArrowLeft, FileText, User, Phone, Home, Star } from 'lucide-react';
import {
  useLegalAidRequestDetail, useEligibleRepresentatives,
  useStartLegalAidReview, useRejectLegalAidRequest,
  useAssignRepresentative, useReassignRepresentative, useContinueLegalAidFeedback,
} from '../services/hooks';

// The single action surface for one Legal Aid request - every status
// transition (Start Review / Reject / Assign Public Prosecutor) and the
// poor-feedback review loop all live here, gated by the request's own
// current status. Same list -> detail convention as
// ReferralDetail.jsx/InterventionRequestDetail.jsx.
//
// There is no "Mark Complete" action here (per explicit product request) -
// assigning a Public Prosecutor doesn't mean the case is done, and DLSA has
// no other terminal step in this flow; a request stays 'Active' for as long
// as the underlying case runs. Only the eCourt-reported case_stage (an
// entirely separate fact - see ecourtStageSync.js) ever says a case is
// actually closed.
//
// migration_043: trimmed to exactly what's needed day to day - docket
// number, victim details, current (eCourt) case stage, Legal Aid status,
// reason, documents, and victim feedback, plus the Reassign action. Case
// Type, the Assignment History timeline, and the Legal Aid Hearing Records
// list are no longer shown here (the reassign panel's own "currently X"
// label already names the current Public Prosecutor, which was the only
// thing Assignment History was still needed for on this page).

const STATUS_BADGE = {
  Submitted: 'bg-amber-100 text-amber-700',
  'Under Review': 'bg-sky-100 text-sky-700',
  Verified: 'bg-indigo-100 text-indigo-700',
  Approved: 'bg-teal-100 text-teal-700',
  Rejected: 'bg-rose-100 text-rose-700',
  Active: 'bg-emerald-100 text-emerald-700',
  Completed: 'bg-gray-200 text-gray-700',
};

// Contact details, same disclosure boundary as every other role's own
// detail-view-only contact card - the backend audit-logs every read.
function ContactDetailsCard({ r }) {
  if (!r.victimName && !r.victimContactNumber && !r.victimAddress) return null;
  return (
    <div className="bg-white p-5 rounded-xl border border-gray-200/80 shadow-sm space-y-3">
      <div className="flex items-center gap-1.5">
        <User size={15} className="text-[#3D5A80]" />
        <h3 className="font-bold text-sm text-gray-800">Victim Contact Details</h3>
      </div>
      <p className="text-[11px] text-gray-400">Every view of these details is recorded in the audit log.</p>
      {r.victimName && (
        <div>
          <span className="text-[10px] font-bold tracking-wider text-gray-400 uppercase block">Name</span>
          <span className="text-xs font-bold text-gray-800">{r.victimName}</span>
        </div>
      )}
      {r.victimContactNumber && (
        <div>
          <span className="text-[10px] font-bold tracking-wider text-gray-400 uppercase block mb-0.5">Contact</span>
          <a href={`tel:${r.victimContactNumber}`} className="inline-flex items-center gap-1.5 text-xs font-bold text-[#519BCE] hover:underline">
            <Phone size={12} /> {r.victimContactNumber}
          </a>
        </div>
      )}
      {r.victimAddress && (
        <div>
          <span className="text-[10px] font-bold tracking-wider text-gray-400 uppercase block mb-0.5">Address</span>
          <span className="flex items-start gap-1.5 text-xs text-gray-700 leading-relaxed">
            <Home size={12} className="mt-0.5 shrink-0 text-gray-400" /> {r.victimAddress}
          </span>
        </div>
      )}
    </div>
  );
}

function DocumentsCard({ documents }) {
  return (
    <div className="bg-white p-5 rounded-xl border border-gray-200/80 shadow-sm space-y-3">
      <div className="flex items-center gap-1.5">
        <FileText size={15} className="text-[#3D5A80]" />
        <h3 className="font-bold text-sm text-gray-800">Documents</h3>
      </div>
      {documents?.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {documents.map((d) => (
            d.signedUrl ? (
              <a key={d.documentId} href={d.signedUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 rounded-md hover:bg-gray-50 transition text-xs text-gray-700">
                <FileText size={13} /> {d.documentLabel}
                {d.source === 'existing_case_document' && <span className="text-[9px] text-gray-400">(on file)</span>}
              </a>
            ) : (
              <span key={d.documentId} className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 text-gray-400 rounded-md text-xs">
                <FileText size={13} /> {d.documentLabel} (unavailable)
              </span>
            )
          ))}
        </div>
      ) : (
        <p className="text-xs text-gray-400">No documents attached.</p>
      )}
    </div>
  );
}

// Every feedback the victim has left about their Public Prosecutor(s) on
// this case (migration_043: one per assignment, not per hearing) - good or
// poor, not just the poor/unreviewed ones PendingFeedbackCard above already
// surfaces as an action item.
function FeedbackCard({ feedback }) {
  return (
    <div className="bg-white p-5 rounded-xl border border-gray-200/80 shadow-sm space-y-3">
      <div className="flex items-center gap-1.5">
        <Star size={15} className="text-[#3D5A80]" />
        <h3 className="font-bold text-sm text-gray-800">Feedback from Victim</h3>
      </div>
      {feedback?.length > 0 ? (
        <div className="space-y-2">
          {feedback.map((f) => (
            <div key={f.feedbackId} className="border border-gray-100 rounded-lg px-3 py-2 text-xs space-y-1">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1 text-amber-500">
                  {Array.from({ length: 5 }).map((_, i) => <Star key={i} size={13} fill={i < f.rating ? 'currentColor' : 'none'} />)}
                </div>
                <span className="text-[10px] text-gray-400">{new Date(f.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
              </div>
              {f.comment && <p className="text-gray-600 italic">"{f.comment}"</p>}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-gray-400">No feedback submitted yet.</p>
      )}
    </div>
  );
}

function PendingFeedbackCard({ feedback, requestId, onDecided }) {
  const reassign = useReassignRepresentative();
  const continueRep = useContinueLegalAidFeedback();
  const eligible = useEligibleRepresentatives(requestId);
  const [showReassign, setShowReassign] = useState(null);
  const [newRepId, setNewRepId] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState(null);

  if (!feedback?.length) return null;

  const handleContinue = async (feedbackId) => {
    setError(null);
    try {
      await continueRep.mutate(requestId, feedbackId);
      onDecided();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleReassignConfirm = async (feedbackId) => {
    if (!newRepId || !reason.trim()) return;
    setError(null);
    try {
      await reassign.mutate(requestId, { newRepresentativeOfficialId: newRepId, endedReason: reason.trim(), feedbackId });
      setShowReassign(null);
      setNewRepId('');
      setReason('');
      onDecided();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="bg-rose-50 border border-rose-200 rounded-xl p-5 space-y-3">
      <div className="flex items-center gap-1.5">
        <Star size={15} className="text-rose-600" />
        <h3 className="font-bold text-sm text-rose-800">Poor Feedback Needs Your Review</h3>
      </div>
      {feedback.map((f) => (
        <div key={f.feedbackId} className="bg-white rounded-lg p-4 space-y-2 border border-rose-100">
          <div className="flex items-center gap-1 text-amber-500">
            {Array.from({ length: 5 }).map((_, i) => <Star key={i} size={14} fill={i < f.rating ? 'currentColor' : 'none'} />)}
            <span className="text-xs text-gray-500 ml-1">for hearing on {new Date(f.hearingDate).toLocaleDateString('en-IN')}</span>
          </div>
          {f.comment && <p className="text-xs text-gray-700 italic">"{f.comment}"</p>}

          {showReassign === f.feedbackId ? (
            <div className="space-y-2 pt-1">
              <select value={newRepId} onChange={(e) => setNewRepId(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs">
                <option value="">Select a new Public Prosecutor...</option>
                {(eligible.data?.representatives || []).map((rep) => (
                  <option key={rep.officialId} value={rep.officialId}>{rep.fullName} ({rep.designation || 'no designation'}) - {rep.activeCaseCount} active case(s)</option>
                ))}
              </select>
              <input type="text" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason for reassignment (required)" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs" />
              <div className="flex gap-2">
                <button onClick={() => handleReassignConfirm(f.feedbackId)} disabled={!newRepId || !reason.trim() || reassign.loading} className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-semibold transition disabled:opacity-60">
                  Confirm Reassignment
                </button>
                <button onClick={() => setShowReassign(null)} className="px-3 py-1.5 text-gray-500 text-xs">Cancel</button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2 pt-1">
              <button onClick={() => handleContinue(f.feedbackId)} disabled={continueRep.loading} className="px-3 py-1.5 border border-emerald-300 text-emerald-700 hover:bg-emerald-50 rounded-lg text-xs font-semibold transition disabled:opacity-60">
                Continue with current Public Prosecutor
              </button>
              <button onClick={() => setShowReassign(f.feedbackId)} className="px-3 py-1.5 border border-rose-300 text-rose-700 hover:bg-rose-50 rounded-lg text-xs font-semibold transition">
                Reassign Public Prosecutor
              </button>
            </div>
          )}
        </div>
      ))}
      {error && <p className="text-xs text-rose-700">{error}</p>}
    </div>
  );
}

// Standalone reassignment - available on any Active case regardless of
// whether there's poor feedback prompting it (a Public Prosecutor going
// unavailable, moving districts, etc. is a real reason to swap them that has
// nothing to do with feedback). Same backend action as the feedback-driven
// one in PendingFeedbackCard - reassign only requires a reason, feedbackId
// is optional there specifically so this standalone path can omit it.
function StandaloneReassignPanel({ requestId, currentAssignment, onDone }) {
  const reassign = useReassignRepresentative();
  const eligible = useEligibleRepresentatives(requestId);
  const [open, setOpen] = useState(false);
  const [newRepId, setNewRepId] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState(null);

  const handleConfirm = async () => {
    if (!newRepId || !reason.trim()) return;
    setError(null);
    try {
      await reassign.mutate(requestId, { newRepresentativeOfficialId: newRepId, endedReason: reason.trim() });
      setOpen(false);
      setNewRepId('');
      setReason('');
      onDone();
    } catch (err) {
      setError(err.message);
    }
  };

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="px-4 py-2 border border-rose-300 text-rose-700 hover:bg-rose-50 rounded-lg text-xs font-semibold transition">
        Reassign Public Prosecutor
      </button>
    );
  }

  return (
    <div className="bg-white p-5 rounded-xl border border-gray-200/80 shadow-sm space-y-3 w-full">
      <h3 className="font-bold text-sm text-gray-800">
        Reassign Public Prosecutor{currentAssignment ? ` (currently ${currentAssignment.representativeName})` : ''}
      </h3>
      {eligible.loading ? (
        <p className="text-xs text-gray-400">Loading eligible Public Prosecutors...</p>
      ) : (
        <select value={newRepId} onChange={(e) => setNewRepId(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs">
          <option value="">Select a new Public Prosecutor...</option>
          {(eligible.data?.representatives || [])
            .filter((rep) => rep.officialId !== currentAssignment?.representativeOfficialId)
            .map((rep) => (
              <option key={rep.officialId} value={rep.officialId}>{rep.fullName} ({rep.designation || 'no designation'}) - {rep.activeCaseCount} active case(s)</option>
            ))}
        </select>
      )}
      <input type="text" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason for reassignment (required)" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs" />
      {error && <p className="text-xs text-rose-700">{error}</p>}
      <div className="flex gap-2">
        <button onClick={handleConfirm} disabled={!newRepId || !reason.trim() || reassign.loading} className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-semibold transition disabled:opacity-60">
          {reassign.loading ? 'Working...' : 'Confirm Reassignment'}
        </button>
        <button onClick={() => { setOpen(false); setError(null); }} className="px-3 py-2 text-gray-500 text-xs">Cancel</button>
      </div>
    </div>
  );
}

export default function LegalAidRequestDetail() {
  const { requestId } = useParams();
  const navigate = useNavigate();
  const detailQuery = useLegalAidRequestDetail(requestId);
  const eligible = useEligibleRepresentatives(requestId);
  const startReview = useStartLegalAidReview();
  const reject = useRejectLegalAidRequest();
  const assign = useAssignRepresentative();

  const [showRejectReason, setShowRejectReason] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [showAssign, setShowAssign] = useState(false);
  const [repId, setRepId] = useState('');
  const [actionError, setActionError] = useState(null);

  const r = detailQuery.data;

  if (detailQuery.loading) {
    return <StaffLayout title="Legal Aid Request"><p className="text-sm text-gray-400">Loading...</p></StaffLayout>;
  }
  if (detailQuery.error || !r) {
    return (
      <StaffLayout title="Legal Aid Request">
        <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm px-4 py-3 rounded-lg">
          {detailQuery.error || 'This request could not be located.'}
        </div>
      </StaffLayout>
    );
  }

  async function runAction(mutate, ...args) {
    setActionError(null);
    try {
      await mutate(...args);
      detailQuery.refetch();
    } catch (err) {
      setActionError(err.message || 'Could not complete this action.');
    }
  }

  return (
    <StaffLayout title="Legal Aid Request">
      <div className="space-y-6">
        <button onClick={() => navigate('/dlsa')} className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-gray-700 transition">
          <ArrowLeft size={14} /> Back to Legal Aid Requests
        </button>

        <div className="bg-white p-5 rounded-xl border border-gray-200/80 shadow-sm flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-10 flex-wrap">
            <div>
              <span className="text-[10px] font-bold tracking-wider text-gray-400 uppercase block">Docket Number</span>
              <span className="text-base font-bold text-gray-800">{r.docketNumber}</span>
            </div>
            <div>
              <span className="text-[10px] font-bold tracking-wider text-gray-400 uppercase block">Case Stage</span>
              <span className="text-xs font-bold text-gray-700">{r.caseStage}</span>
            </div>
            <div>
              <span className="text-[10px] font-bold tracking-wider text-gray-400 uppercase block mb-1">Status of Legal Aid</span>
              <span className={`text-xs font-bold px-2.5 py-0.5 rounded ${STATUS_BADGE[r.status] || 'bg-gray-100 text-gray-600'}`}>{r.status}</span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            {r.status === 'Submitted' && (
              <button onClick={() => runAction(startReview.mutate, r.requestId)} disabled={startReview.loading} className="px-4 py-2 bg-[#519BCE] hover:bg-[#4686b3] text-white rounded-lg text-xs font-semibold transition disabled:opacity-60">
                {startReview.loading ? 'Working...' : 'Start Review'}
              </button>
            )}
            {r.status === 'Under Review' && !showRejectReason && !showAssign && (
              <>
                <button onClick={() => setShowAssign(true)} className="px-4 py-2 bg-[#519BCE] hover:bg-[#4686b3] text-white rounded-lg text-xs font-semibold transition">
                  Assign Public Prosecutor
                </button>
                <button onClick={() => setShowRejectReason(true)} className="px-4 py-2 border border-rose-300 text-rose-700 hover:bg-rose-50 rounded-lg text-xs font-semibold transition">
                  Reject
                </button>
              </>
            )}
          </div>
        </div>

        {/* Reassignment isn't only a feedback-driven action - a Public
            Prosecutor going unavailable, changing district, etc. is reason
            enough on its own, so this is offered on every Active case,
            independent of PendingFeedbackCard below. */}
        {r.status === 'Active' && (
          <StandaloneReassignPanel
            requestId={r.requestId}
            currentAssignment={r.assignments?.find((a) => a.status === 'Active')}
            onDone={detailQuery.refetch}
          />
        )}

        {showRejectReason && (
          <div className="bg-white p-5 rounded-xl border border-gray-200/80 shadow-sm flex items-center gap-2">
            <input
              type="text" value={rejectReason} onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Reason for rejection (required)" className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-xs"
            />
            <button
              onClick={() => runAction(reject.mutate, r.requestId, { reason: rejectReason.trim() }).then(() => setShowRejectReason(false))}
              disabled={!rejectReason.trim() || reject.loading}
              className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-semibold transition disabled:opacity-60 shrink-0"
            >
              {reject.loading ? 'Working...' : 'Confirm Reject'}
            </button>
            <button onClick={() => { setShowRejectReason(false); setRejectReason(''); }} className="px-3 py-2 text-gray-500 text-xs shrink-0">Cancel</button>
          </div>
        )}

        {showAssign && (
          <div className="bg-white p-5 rounded-xl border border-gray-200/80 shadow-sm space-y-3">
            <h3 className="font-bold text-sm text-gray-800">Assign a Public Prosecutor</h3>
            {eligible.loading ? (
              <p className="text-xs text-gray-400">Loading eligible Public Prosecutors...</p>
            ) : (eligible.data?.representatives || []).length === 0 ? (
              <p className="text-xs text-gray-400">No active Public Prosecutors are assigned to this jurisdiction yet.</p>
            ) : (
              <select value={repId} onChange={(e) => setRepId(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs">
                <option value="">Select a Public Prosecutor...</option>
                {eligible.data.representatives.map((rep) => (
                  <option key={rep.officialId} value={rep.officialId}>{rep.fullName} ({rep.designation || 'no designation'}) - {rep.activeCaseCount} active case(s)</option>
                ))}
              </select>
            )}
            <div className="flex gap-2">
              <button
                onClick={() => runAction(assign.mutate, r.requestId, { representativeOfficialId: repId }).then(() => setShowAssign(false))}
                disabled={!repId || assign.loading}
                className="px-4 py-2 bg-[#519BCE] hover:bg-[#4686b3] text-white rounded-lg text-xs font-semibold transition disabled:opacity-60"
              >
                {assign.loading ? 'Working...' : 'Confirm Assignment'}
              </button>
              <button onClick={() => setShowAssign(false)} className="px-3 py-2 text-gray-500 text-xs">Cancel</button>
            </div>
          </div>
        )}

        {actionError && <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs px-4 py-3 rounded-lg">{actionError}</div>}

        {r.status === 'Rejected' && r.rejectionReason && (
          <div className="bg-rose-50 border border-rose-200 rounded-lg px-4 py-3">
            <p className="text-xs font-bold text-rose-700 uppercase tracking-wide mb-1">Rejection Reason</p>
            <p className="text-sm text-rose-700">{r.rejectionReason}</p>
          </div>
        )}

        <PendingFeedbackCard feedback={r.pendingFeedbackReview} requestId={r.requestId} onDecided={detailQuery.refetch} />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white p-6 rounded-xl border border-gray-200/80 shadow-sm">
              <h3 className="font-bold text-sm text-gray-800 mb-2">Reason for Legal Aid Request</h3>
              <p className="text-xs text-gray-600 whitespace-pre-wrap leading-relaxed mb-3">{r.reason}</p>
              {r.description && (
                <>
                  <h3 className="font-bold text-sm text-gray-800 mb-2 mt-4">Description</h3>
                  <p className="text-xs text-gray-600 whitespace-pre-wrap leading-relaxed">{r.description}</p>
                </>
              )}
            </div>
            <DocumentsCard documents={r.documents} />
            <FeedbackCard feedback={r.feedback} />
          </div>

          <div className="space-y-6">
            <ContactDetailsCard r={r} />
          </div>
        </div>
      </div>
    </StaffLayout>
  );
}
