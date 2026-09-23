import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { usePageHeader } from '../../shared/context/PageHeaderContext';
import { ArrowLeft, FileText, User, Phone, Home, Gavel } from 'lucide-react';
import {
  useLegalAidRequestDetail, useEligibleRepresentatives,
  useStartLegalAidReview, useRejectLegalAidRequest,
  useAssignRepresentative, useReassignRepresentative,
} from '../services/hooks';
import GlideSelect from '../../shared/components/GlideSelect';

// The single action surface for one Legal Aid request - every status
// transition (Start Review / Reject / Assign Public Prosecutor) lives here,
// gated by the request's own current status. Same list -> detail convention
// as ReferralDetail.jsx/InterventionRequestDetail.jsx.
//
// There is no "Mark Complete" action here (per explicit product request) -
// assigning a Public Prosecutor doesn't mean the case is done, and DLSA has
// no other terminal step in this flow; a request stays 'Active' for as long
// as the underlying case runs. Only the eCourt-reported case_stage (an
// entirely separate fact - see ecourtStageSync.js) ever says a case is
// actually closed.
//
// migration_044: Assign Public Prosecutor no longer activates the case by
// itself - it creates a 'Pending Acceptance' assignment the Public
// Prosecutor must accept (or reject) themselves; Feedback is removed
// application-wide (FeedbackCard/PendingFeedbackCard are gone); the Hearing
// Records list is eCourt-sourced (never DLSA/PP-authored) with each Public
// Prosecutor note shown inline.

const STATUS_BADGE = {
  Submitted: 'bg-amber-100 text-amber-700',
  'Under Review': 'bg-sky-100 text-sky-700',
  Rejected: 'bg-rose-100 text-rose-700',
  Active: 'bg-emerald-100 text-emerald-700',
  Completed: 'bg-gray-200 text-gray-700',
};

const ASSIGNMENT_STATUS_BADGE = {
  'Pending Acceptance': 'bg-amber-100 text-amber-700',
  Active: 'bg-emerald-100 text-emerald-700',
  Rejected: 'bg-rose-100 text-rose-700',
  Reassigned: 'bg-gray-200 text-gray-600',
  Completed: 'bg-gray-200 text-gray-700',
};

// Contact details, same disclosure boundary as every other role's own
// detail-view-only contact card - the backend audit-logs every read.
function ContactDetailsCard({ r }) {
  if (!r.victimName && !r.victimContactNumber && !r.victimAddress) return null;
  return (
    <div className="bg-white p-5 rounded-xl border border-gray-200/80 shadow-sm space-y-3">
      <div className="flex items-center gap-1.5">
        <User size={15} className="text-brand-900" />
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
          <a href={`tel:${r.victimContactNumber}`} className="inline-flex items-center gap-1.5 text-xs font-bold text-brand-600 hover:underline">
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
        <FileText size={15} className="text-brand-900" />
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

// Requirement 8 - every past hearing comes from eCourt (never DLSA/PP-
// authored); the assigned Public Prosecutor's own notes on each are shown
// alongside, read-only from this side.
function HearingTimelineCard({ hearingTimeline }) {
  return (
    <div className="bg-white p-5 rounded-xl border border-gray-200/80 shadow-sm space-y-3">
      <div className="flex items-center gap-1.5">
        <Gavel size={15} className="text-brand-900" />
        <h3 className="font-bold text-sm text-gray-800">Hearing Timeline</h3>
      </div>
      {!hearingTimeline?.available ? (
        <p className="text-xs text-gray-400">{hearingTimeline?.reason || 'Not available yet.'}</p>
      ) : hearingTimeline.pastHearings?.length > 0 ? (
        <div className="space-y-2">
          {hearingTimeline.pastHearings.map((h) => (
            <div key={h.hearingDate} className="border border-gray-100 rounded-lg px-3 py-2 text-xs space-y-1">
              <span className="font-bold text-gray-800">{new Date(h.hearingDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
              <p className="text-gray-600">{h.business}</p>
              {h.notes?.map((n) => (
                <p key={n.noteId} className="text-gray-500 italic pl-2 border-l-2 border-gray-200">{n.noteText}</p>
              ))}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-gray-400">No hearings recorded by eCourt yet.</p>
      )}
    </div>
  );
}

// Reassignment - a Public Prosecutor going unavailable, changing district,
// etc. is reason enough on its own to swap them. Available on any Active
// case; the new Public Prosecutor gets the same Accept/Reject step as a
// first-time assignment (their own assignment starts 'Pending Acceptance').
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
        <GlideSelect
          options={(eligible.data?.representatives || [])
            .filter((rep) => rep.officialId !== currentAssignment?.representativeOfficialId)
            .map((rep) => ({
              value: rep.officialId,
              label: `${rep.fullName} (${rep.designation || 'no designation'}) - ${rep.activeCaseCount} active case(s)`,
            }))}
          value={newRepId}
          onChange={(val) => setNewRepId(val)}
          placeholder="Select a new Public Prosecutor..."
          ariaLabel="New Public Prosecutor"
          menuWidth={320}
        />
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

  usePageHeader({ title: 'Legal Aid Request' });

  const r = detailQuery.data;

  if (detailQuery.loading) {
    return <p className="text-sm text-gray-400">Loading...</p>;
  }
  if (detailQuery.error || !r) {
    return (
      <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm px-4 py-3 rounded-lg">
        {detailQuery.error || 'This request could not be located.'}
      </div>
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

  const currentAssignment = r.assignments?.find((a) => a.status === 'Active');
  const pendingAssignment = r.assignments?.find((a) => a.status === 'Pending Acceptance');
  const latestAssignment = r.assignments?.[r.assignments.length - 1];
  const needsReassignment = latestAssignment?.status === 'Rejected';

  return (
    <>
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
            {pendingAssignment && (
              <div>
                <span className="text-[10px] font-bold tracking-wider text-gray-400 uppercase block mb-1">Assignment</span>
                <span className={`text-xs font-bold px-2.5 py-0.5 rounded ${ASSIGNMENT_STATUS_BADGE['Pending Acceptance']}`}>
                  Awaiting {pendingAssignment.representativeName}'s acceptance
                </span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            {r.status === 'Submitted' && (
              <button onClick={() => runAction(startReview.mutate, r.requestId)} disabled={startReview.loading} className="px-4 py-2 bg-brand-700 hover:bg-brand-800 text-white rounded-lg text-xs font-semibold transition disabled:opacity-60">
                {startReview.loading ? 'Working...' : 'Start Review'}
              </button>
            )}
            {r.status === 'Under Review' && !pendingAssignment && !showRejectReason && !showAssign && (
              <>
                <button onClick={() => setShowAssign(true)} className="px-4 py-2 bg-brand-700 hover:bg-brand-800 text-white rounded-lg text-xs font-semibold transition">
                  Assign Public Prosecutor
                </button>
                <button onClick={() => setShowRejectReason(true)} className="px-4 py-2 border border-rose-300 text-rose-700 hover:bg-rose-50 rounded-lg text-xs font-semibold transition">
                  Reject
                </button>
              </>
            )}
          </div>
        </div>

        {needsReassignment && (
          <div className="bg-rose-50 border border-rose-200 text-rose-800 text-xs px-4 py-3 rounded-lg font-semibold">
            Public Prosecutor rejected - need to assign another Public Prosecutor.
            {latestAssignment.endedReason ? ` Reason given: "${latestAssignment.endedReason}"` : ''}
          </div>
        )}

        {/* Reassignment isn't only a feedback-driven action - a Public
            Prosecutor going unavailable, changing district, etc. is reason
            enough on its own. */}
        {r.status === 'Active' && currentAssignment && (
          <StandaloneReassignPanel
            requestId={r.requestId}
            currentAssignment={currentAssignment}
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
              <GlideSelect
                options={eligible.data.representatives.map((rep) => ({
                  value: rep.officialId,
                  label: `${rep.fullName} (${rep.designation || 'no designation'}) - ${rep.activeCaseCount} active case(s)`,
                }))}
                value={repId}
                onChange={(val) => setRepId(val)}
                placeholder="Select a Public Prosecutor..."
                ariaLabel="Public Prosecutor"
                menuWidth={320}
              />
            )}
            <div className="flex gap-2">
              <button
                onClick={() => runAction(assign.mutate, r.requestId, { representativeOfficialId: repId }).then(() => setShowAssign(false))}
                disabled={!repId || assign.loading}
                className="px-4 py-2 bg-brand-700 hover:bg-brand-800 text-white rounded-lg text-xs font-semibold transition disabled:opacity-60"
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
            <HearingTimelineCard hearingTimeline={r.hearingTimeline} />
          </div>

          <div className="space-y-6">
            <ContactDetailsCard r={r} />
          </div>
        </div>
      </div>
    </>
  );
}
