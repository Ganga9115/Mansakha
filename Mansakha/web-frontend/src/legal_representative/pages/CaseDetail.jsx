import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import StaffLayout from '../layouts/StaffLayout';
import { ArrowLeft, FileText, Gavel, Lock, PlusCircle } from 'lucide-react';
import { useMyCaseDetail, useRecordHearing, usePrivateNotes, useAddPrivateNote } from '../services/hooks';

// The representative's own working view of one case: Case Overview (read-
// only - no DLSA-level assign/reassign controls here), Hearing Timeline (the
// official, shared record - visible to DLSA and the victim too), and Private
// Notes in its own visually distinct panel so the shared/private boundary is
// obvious at a glance rather than easy to miss.

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
        <FileText size={15} className="text-[#3D5A80]" />
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

function HearingTimeline({ requestId, hearings, onRecorded, canRecord }) {
  const record = useRecordHearing();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ hearingDate: '', court: '', hearingType: '', outcome: '', nextHearingDate: '', notes: '' });
  const [error, setError] = useState(null);

  const handleSubmit = async () => {
    if (!form.hearingDate || !form.outcome.trim()) return;
    setError(null);
    try {
      await record.mutate(requestId, {
        hearingDate: form.hearingDate,
        court: form.court.trim() || null,
        hearingType: form.hearingType.trim() || null,
        outcome: form.outcome.trim(),
        nextHearingDate: form.nextHearingDate || null,
        notes: form.notes.trim() || null,
      });
      setForm({ hearingDate: '', court: '', hearingType: '', outcome: '', nextHearingDate: '', notes: '' });
      setShowForm(false);
      onRecorded();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="bg-white p-5 rounded-xl border border-gray-200/80 shadow-sm space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Gavel size={15} className="text-[#3D5A80]" />
          <h3 className="font-bold text-sm text-gray-800">Hearing Timeline</h3>
        </div>
        {canRecord && !showForm && (
          <button onClick={() => setShowForm(true)} className="flex items-center gap-1.5 text-xs font-semibold text-[#519BCE] hover:underline">
            <PlusCircle size={14} /> Record Hearing Outcome
          </button>
        )}
      </div>

      {showForm && (
        <div className="bg-[#F8F9FA] rounded-lg p-4 space-y-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <input type="date" value={form.hearingDate} onChange={(e) => setForm((f) => ({ ...f, hearingDate: e.target.value }))} className="px-3 py-2 border border-gray-300 rounded-lg text-xs" placeholder="Hearing date" />
            <input type="text" value={form.court} onChange={(e) => setForm((f) => ({ ...f, court: e.target.value }))} className="px-3 py-2 border border-gray-300 rounded-lg text-xs" placeholder="Court / proceeding" />
          </div>
          <input type="text" value={form.hearingType} onChange={(e) => setForm((f) => ({ ...f, hearingType: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs" placeholder="Hearing stage / type (e.g. Evidence, Arguments)" />
          <textarea value={form.outcome} onChange={(e) => setForm((f) => ({ ...f, outcome: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs" placeholder="Outcome (required)" rows={2} />
          <input type="date" value={form.nextHearingDate} onChange={(e) => setForm((f) => ({ ...f, nextHearingDate: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs" placeholder="Next hearing date (if any)" />
          <textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs" placeholder="General case/proceeding notes for the official record" rows={2} />
          {error && <p className="text-xs text-rose-600">{error}</p>}
          <div className="flex gap-2">
            <button onClick={handleSubmit} disabled={!form.hearingDate || !form.outcome.trim() || record.loading} className="px-4 py-2 bg-[#519BCE] hover:bg-[#4686b3] text-white rounded-lg text-xs font-semibold transition disabled:opacity-60">
              {record.loading ? 'Saving...' : 'Save Hearing Outcome'}
            </button>
            <button onClick={() => setShowForm(false)} className="px-3 py-2 text-gray-500 text-xs">Cancel</button>
          </div>
        </div>
      )}

      {hearings?.length > 0 ? (
        <div className="space-y-2">
          {hearings.map((h) => (
            <div key={h.hearingId} className="border border-gray-100 rounded-lg px-3 py-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-bold text-gray-800">{new Date(h.hearingDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                {h.court && <span className="text-gray-400">{h.court}</span>}
              </div>
              {h.hearingType && <p className="text-[10px] text-gray-400 mt-0.5">{h.hearingType}</p>}
              <p className="text-gray-600 mt-1">{h.outcome}</p>
              {h.notes && <p className="text-gray-500 mt-1 italic">{h.notes}</p>}
              {h.nextHearingDate && <p className="text-[10px] text-gray-400 mt-1">Next hearing: {new Date(h.nextHearingDate).toLocaleDateString('en-IN')}</p>}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-gray-400">No hearings recorded yet.</p>
      )}
    </div>
  );
}

// Visually distinct from the Hearing Timeline above (muted panel, lock icon)
// so the shared/private boundary is obvious - these notes never reach DLSA
// or the victim, enforced server-side (see legalRepresentative.routes.js).
function PrivateNotesPanel({ requestId, canWrite }) {
  const notesQuery = usePrivateNotes(requestId);
  const addNote = useAddPrivateNote();
  const [noteText, setNoteText] = useState('');
  const [error, setError] = useState(null);

  const handleAdd = async () => {
    if (!noteText.trim()) return;
    setError(null);
    try {
      await addNote.mutate(requestId, noteText.trim());
      setNoteText('');
      notesQuery.refetch();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="bg-gray-50 p-5 rounded-xl border border-gray-300 border-dashed space-y-3">
      <div className="flex items-center gap-1.5">
        <Lock size={15} className="text-gray-500" />
        <h3 className="font-bold text-sm text-gray-700">Private Notes</h3>
      </div>
      <p className="text-[11px] text-gray-500">
        Strictly internal - visible only to you. Never shown to DLSA, the victim, or included in the official case record.
      </p>

      {canWrite && (
        <div className="space-y-2">
          <textarea
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            placeholder="Preparation notes, strategy reminders, follow-ups..."
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs bg-white"
            rows={2}
          />
          {error && <p className="text-xs text-rose-600">{error}</p>}
          <button onClick={handleAdd} disabled={!noteText.trim() || addNote.loading} className="px-3 py-1.5 bg-gray-700 hover:bg-gray-800 text-white rounded-lg text-xs font-semibold transition disabled:opacity-60">
            {addNote.loading ? 'Saving...' : 'Add Note'}
          </button>
        </div>
      )}

      {notesQuery.loading ? (
        <p className="text-xs text-gray-400">Loading...</p>
      ) : (notesQuery.data?.notes || []).length === 0 ? (
        <p className="text-xs text-gray-400">No private notes yet.</p>
      ) : (
        <div className="space-y-2">
          {notesQuery.data.notes.map((n) => (
            <div key={n.noteId} className="bg-white border border-gray-200 rounded-lg px-3 py-2 text-xs">
              <p className="text-gray-700 whitespace-pre-wrap">{n.noteText}</p>
              <p className="text-[10px] text-gray-400 mt-1">{new Date(n.createdAt).toLocaleString('en-IN')}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function CaseDetail() {
  const { requestId } = useParams();
  const navigate = useNavigate();
  const detailQuery = useMyCaseDetail(requestId);
  const r = detailQuery.data;

  if (detailQuery.loading) {
    return <StaffLayout title="Case"><p className="text-sm text-gray-400">Loading...</p></StaffLayout>;
  }
  if (detailQuery.error || !r) {
    return (
      <StaffLayout title="Case">
        <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm px-4 py-3 rounded-lg">
          {detailQuery.error || 'This case could not be located.'}
        </div>
      </StaffLayout>
    );
  }

  const canRecord = r.myAssignmentStatus === 'Active';

  return (
    <StaffLayout title="Case">
      <div className="space-y-6">
        <button onClick={() => navigate('/legalrepresentative')} className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-gray-700 transition">
          <ArrowLeft size={14} /> Back to My Cases
        </button>

        {!canRecord && (
          <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs px-4 py-3 rounded-lg">
            You are no longer the active representative on this case ({r.myAssignmentStatus}). This view is read-only.
          </div>
        )}

        <CaseOverview r={r} />
        <DocumentsCard documents={r.documents} />
        <HearingTimeline requestId={requestId} hearings={r.hearings} onRecorded={detailQuery.refetch} canRecord={canRecord} />
        <PrivateNotesPanel requestId={requestId} canWrite={canRecord} />
      </div>
    </StaffLayout>
  );
}
