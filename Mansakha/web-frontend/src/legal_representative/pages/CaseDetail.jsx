import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { usePageHeader } from '../../shared/context/PageHeaderContext';
import { ArrowLeft, FileText, Gavel, CheckCircle, XCircle, PlusCircle } from 'lucide-react';
import { useMyCaseDetail, useAddHearingNote, useAcceptCase, useRejectCase } from '../services/hooks';

// The representative's own working view of one case: an Accept/Reject
// banner while the assignment is still pending (requirement 6), Case
// Overview (read-only - no DLSA-level assign/reassign controls here), and
// the Hearing Timeline - eCourt-reported past hearings only (requirement 8),
// each with its own "Add Notes" action. Private Notes is gone entirely
// (migration_044) - a hearing note is the one remaining notes mechanism,
// and unlike Private Notes it is visible to DLSA and the victim too.

function AcceptRejectBanner({ requestId, onDecided }) {
  const accept = useAcceptCase();
  const reject = useRejectCase();
  const [showReject, setShowReject] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState(null);

  const handleAccept = async () => {
    setError(null);
    try {
      await accept.mutate(requestId);
      onDecided();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleReject = async () => {
    setError(null);
    try {
      await reject.mutate(requestId, reason.trim() || undefined);
      onDecided();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 space-y-3">
      <h3 className="font-bold text-sm text-amber-900">DLSA has assigned you this case</h3>
      <p className="text-xs text-amber-800">Review the case details below, then accept to take it on or reject if you're unable to.</p>
      {!showReject ? (
        <div className="flex gap-2">
          <button onClick={handleAccept} disabled={accept.loading} className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold transition disabled:opacity-60">
            <CheckCircle size={14} /> {accept.loading ? 'Accepting...' : 'Accept Case'}
          </button>
          <button onClick={() => setShowReject(true)} className="flex items-center gap-1.5 px-4 py-2 border border-rose-300 text-rose-700 hover:bg-rose-50 rounded-lg text-xs font-semibold transition">
            <XCircle size={14} /> Reject Case
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <input
            type="text" value={reason} onChange={(e) => setReason(e.target.value)}
            placeholder="Reason for rejecting (optional)" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs"
          />
          <div className="flex gap-2">
            <button onClick={handleReject} disabled={reject.loading} className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-semibold transition disabled:opacity-60">
              {reject.loading ? 'Working...' : 'Confirm Reject'}
            </button>
            <button onClick={() => { setShowReject(false); setReason(''); }} className="px-3 py-2 text-gray-500 text-xs">Cancel</button>
          </div>
        </div>
      )}
      {error && <p className="text-xs text-rose-700">{error}</p>}
    </div>
  );
}

function CaseOverview({ r }) {
  return (
    <div className="bg-white p-6 rounded-xl border border-gray-200/80 shadow-sm space-y-4">
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
          <span className="text-[10px] font-bold tracking-wider text-gray-400 uppercase block">Case Stage</span>
          <span className="text-xs font-bold text-gray-700">{r.caseStage}</span>
        </div>
        <div>
          <span className="text-[10px] font-bold tracking-wider text-gray-400 uppercase block">Legal Aid Status</span>
          <span className="text-xs font-bold text-gray-700">{r.requestStatus}</span>
        </div>
      </div>
      <div>
        <h4 className="font-bold text-xs text-gray-800 mb-1">Reason for Legal Aid Request</h4>
        <p className="text-xs text-gray-600 whitespace-pre-wrap leading-relaxed">{r.reason}</p>
      </div>
      {r.description && (
        <div>
          <h4 className="font-bold text-xs text-gray-800 mb-1">Description</h4>
          <p className="text-xs text-gray-600 whitespace-pre-wrap leading-relaxed">{r.description}</p>
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
        <h3 className="font-bold text-sm text-gray-800">Case Documents</h3>
      </div>
      {documents?.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {documents.map((d) => (
            d.signedUrl ? (
              <a key={d.documentId} href={d.signedUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 rounded-md hover:bg-gray-50 transition text-xs text-gray-700">
                <FileText size={13} /> {d.documentLabel}
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

function HearingNoteForm({ requestId, hearingDate, onAdded }) {
  const addNote = useAddHearingNote();
  const [noteText, setNoteText] = useState('');
  const [open, setOpen] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async () => {
    if (!noteText.trim()) return;
    setError(null);
    try {
      await addNote.mutate(requestId, { hearingDate, noteText: noteText.trim() });
      setNoteText('');
      setOpen(false);
      onAdded();
    } catch (err) {
      setError(err.message);
    }
  };

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="flex items-center gap-1 text-[11px] font-semibold text-brand-600 hover:underline">
        <PlusCircle size={12} /> Add Notes
      </button>
    );
  }

  return (
    <div className="space-y-2 mt-1">
      <textarea
        value={noteText} onChange={(e) => setNoteText(e.target.value)}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs bg-white" rows={2}
        placeholder="Your notes on this hearing..."
      />
      {error && <p className="text-xs text-rose-600">{error}</p>}
      <div className="flex gap-2">
        <button onClick={handleSubmit} disabled={!noteText.trim() || addNote.loading} className="px-3 py-1.5 bg-brand-700 hover:bg-brand-800 text-white rounded-lg text-xs font-semibold transition disabled:opacity-60">
          {addNote.loading ? 'Saving...' : 'Save Note'}
        </button>
        <button onClick={() => { setOpen(false); setNoteText(''); }} className="px-3 py-1.5 text-gray-500 text-xs">Cancel</button>
      </div>
    </div>
  );
}

// Requirement 8 - every past hearing comes from the eCourt-simulated feed
// (never PP-entered); notes are the only thing this Public Prosecutor can
// actually add, one at a time, against whichever hearing they concern.
function HearingTimeline({ requestId, hearingTimeline, onChanged, canAddNotes }) {
  if (!hearingTimeline?.available) {
    return (
      <div className="bg-white p-5 rounded-xl border border-gray-200/80 shadow-sm">
        <div className="flex items-center gap-1.5 mb-2">
          <Gavel size={15} className="text-brand-900" />
          <h3 className="font-bold text-sm text-gray-800">Hearing Timeline</h3>
        </div>
        <p className="text-xs text-gray-400">{hearingTimeline?.reason || 'Not available yet.'}</p>
      </div>
    );
  }

  const hearings = hearingTimeline.pastHearings || [];
  return (
    <div className="bg-white p-5 rounded-xl border border-gray-200/80 shadow-sm space-y-3">
      <div className="flex items-center gap-1.5">
        <Gavel size={15} className="text-brand-900" />
        <h3 className="font-bold text-sm text-gray-800">Hearing Timeline</h3>
      </div>
      <p className="text-[11px] text-gray-400">Sourced from the eCourt record - not editable here.</p>

      {hearings.length > 0 ? (
        <div className="space-y-2">
          {hearings.map((h) => (
            <div key={h.hearingDate} className="border border-gray-100 rounded-lg px-3 py-2 text-xs space-y-1">
              <span className="font-bold text-gray-800">{new Date(h.hearingDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
              <p className="text-gray-600">{h.business}</p>
              {h.notes?.map((n) => (
                <p key={n.noteId} className="text-gray-500 italic pl-2 border-l-2 border-gray-200">{n.noteText}</p>
              ))}
              {canAddNotes && <HearingNoteForm requestId={requestId} hearingDate={h.hearingDate} onAdded={onChanged} />}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-gray-400">No hearings recorded by eCourt yet.</p>
      )}
    </div>
  );
}

export default function CaseDetail() {
  const { requestId } = useParams();
  const navigate = useNavigate();
  const detailQuery = useMyCaseDetail(requestId);
  const r = detailQuery.data;

  usePageHeader({ title: 'Case' });

  if (detailQuery.loading) {
    return <p className="text-sm text-gray-400">Loading...</p>;
  }
  if (detailQuery.error || !r) {
    return (
      <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm px-4 py-3 rounded-lg">
        {detailQuery.error || 'This case could not be located.'}
      </div>
    );
  }

  const isPending = r.myAssignmentStatus === 'Pending Acceptance';
  const canRecord = r.myAssignmentStatus === 'Active';

  return (
    <>
      <div className="space-y-6">
        <button onClick={() => navigate('/legalrepresentative')} className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-gray-700 transition">
          <ArrowLeft size={14} /> Back to My Cases
        </button>

        {isPending && <AcceptRejectBanner requestId={requestId} onDecided={detailQuery.refetch} />}

        {!isPending && !canRecord && (
          <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs px-4 py-3 rounded-lg">
            You are no longer the active Public Prosecutor on this case ({r.myAssignmentStatus}). This view is read-only.
          </div>
        )}

        <CaseOverview r={r} />
        <DocumentsCard documents={r.documents} />
        <HearingTimeline requestId={requestId} hearingTimeline={r.hearingTimeline} onChanged={detailQuery.refetch} canAddNotes={canRecord} />
      </div>
    </>
  );
}
