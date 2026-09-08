import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import StaffLayout from '../layouts/StaffLayout';
import { ArrowLeft, CheckCircle2, Send, Gavel, FileCheck, ClipboardList } from 'lucide-react';
import { useReferralDetail, useAddReferralNote, useResolveReferral, useRequestHearing, useRecordOutcome } from '../services/hooks';
import { useCreateTask } from '../services/taskHooks';

// Roles a task may be assigned to - independent of this portal's own role,
// so a directive can be raised for any concerned office, not only this one.
const TASK_ASSIGNABLE_ROLES = [
  'District Welfare Officer', 'Investigating Officer', 'Protection Officer',
  'DLSA Coordinator', 'Special Public Prosecutor', 'District Collector', 'Rehabilitation Officer',
];

// Assign a structured, trackable action item to any concerned office for
// this case - always-visible card on the Detail page (previously a toggled
// disclosure buried inside the list row). Copied verbatim from
// dwo/pages/ReferralDetail.jsx's identical component.
function AssignTaskCard({ userId, referralId }) {
  const [assignedToRole, setAssignedToRole] = useState(TASK_ASSIGNABLE_ROLES[0]);
  const [action, setAction] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const createTask = useCreateTask();

  const handleSubmit = async () => {
    if (!action.trim()) return;
    setError(null);
    setSuccess(false);
    try {
      await createTask.mutate(userId, assignedToRole, action.trim(), dueAt ? new Date(dueAt).toISOString() : null, referralId);
      setAction('');
      setDueAt('');
      setSuccess(true);
    } catch (err) {
      setError(err.message || 'Unable to assign this task. Kindly try again.');
    }
  };

  return (
    <div className="bg-white p-5 rounded-xl border border-gray-200/80 shadow-sm space-y-3">
      <div className="flex items-center gap-1.5">
        <ClipboardList size={15} className="text-[#3D5A80]" />
        <h3 className="font-bold text-sm text-gray-800">Assign Action Item</h3>
      </div>
      <p className="text-[11px] text-gray-400">Raise a structured, due-dated directive for any concerned office on this case.</p>
      <select
        value={assignedToRole}
        onChange={(e) => setAssignedToRole(e.target.value)}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs"
      >
        {TASK_ASSIGNABLE_ROLES.map((role) => <option key={role} value={role}>{role}</option>)}
      </select>
      <textarea
        value={action}
        onChange={(e) => setAction(e.target.value)}
        placeholder="Specify the action required..."
        rows={3}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs"
      />
      <div>
        <label className="text-[10px] font-bold text-gray-500 uppercase block mb-1">Due Date</label>
        <input
          type="date"
          value={dueAt}
          onChange={(e) => setDueAt(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs"
        />
      </div>
      <button
        onClick={handleSubmit}
        disabled={!action.trim() || createTask.loading}
        className="w-full flex items-center justify-center gap-1.5 px-3 py-2.5 bg-[#3D5A80] hover:bg-[#2f4763] text-white rounded-lg text-xs font-semibold transition disabled:opacity-60"
      >
        <Send size={13} />
        {createTask.loading ? 'Submitting...' : 'Submit'}
      </button>
      {error && <p className="text-xs text-rose-600">{error}</p>}
      {success && <p className="text-xs text-emerald-600">Action item assigned successfully.</p>}
    </div>
  );
}

// Special Public Prosecutor's Referral Detail - the full case record for one
// referral: context, the notes thread, and every action (Resolve, File
// Expedited Hearing Request, Record Outcome, Assign Task), laid out as
// proper sections rather than crammed into an accordion. Mirrors
// dwo/pages/ReferralDetail.jsx's structure (the template), with its own
// role-specific Actions card in place of DWO's Forward-to-Rehab button.

const STATUS_BADGE = { Open: 'bg-amber-100 text-amber-700', Resolved: 'bg-emerald-100 text-emerald-700' };

export default function ReferralDetail() {
  const { referralId } = useParams();
  const navigate = useNavigate();
  const [noteText, setNoteText] = useState('');
  const [outcomeText, setOutcomeText] = useState('');
  const [actionError, setActionError] = useState(null);
  const detailQuery = useReferralDetail(referralId);
  const addNote = useAddReferralNote();
  const resolve = useResolveReferral();
  const requestHearing = useRequestHearing();
  const recordOutcome = useRecordOutcome();

  const r = detailQuery.data;

  if (detailQuery.loading) {
    return <StaffLayout title="Referral Detail"><p className="text-sm text-gray-400">Loading...</p></StaffLayout>;
  }
  if (detailQuery.error || !r) {
    return (
      <StaffLayout title="Referral Detail">
        <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm px-4 py-3 rounded-lg">
          {detailQuery.error || 'This referral could not be located.'}
        </div>
      </StaffLayout>
    );
  }

  const metadata = r.metadata || {};

  const handleAddNote = async () => {
    if (!noteText.trim()) return;
    setActionError(null);
    try {
      await addNote.mutate(referralId, noteText.trim());
      setNoteText('');
      detailQuery.refetch();
    } catch (err) {
      setActionError(err.message || 'Could not add note. Kindly try again.');
    }
  };

  const handleResolve = async () => {
    setActionError(null);
    try {
      await resolve.mutate(referralId);
      navigate('/spp');
    } catch (err) {
      setActionError(err.message || 'Could not resolve this referral. Kindly try again.');
    }
  };

  const handleRequestHearing = async () => {
    setActionError(null);
    try {
      await requestHearing.mutate(referralId);
      detailQuery.refetch();
    } catch (err) {
      setActionError(err.message || 'Could not file hearing request. Kindly try again.');
    }
  };

  const handleRecordOutcome = async () => {
    if (!outcomeText.trim()) return;
    setActionError(null);
    try {
      await recordOutcome.mutate(referralId, outcomeText.trim());
      setOutcomeText('');
      detailQuery.refetch();
    } catch (err) {
      setActionError(err.message || 'Could not record outcome. Kindly try again.');
    }
  };

  return (
    <StaffLayout title="Referral Detail">
      <div className="space-y-6">
        <button onClick={() => navigate('/spp')} className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-gray-700 transition">
          <ArrowLeft size={14} /> Back to Trial Docket
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
              <span className="text-[10px] font-bold tracking-wider text-gray-400 uppercase block">Referred On</span>
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
              {resolve.loading ? 'Working...' : 'Mark Resolved'}
            </button>
          )}
        </div>

        {actionError && <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs px-4 py-3 rounded-lg">{actionError}</div>}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            {r.reason && (
              <div className="bg-white p-6 rounded-xl border border-gray-200/80 shadow-sm">
                <h3 className="font-bold text-sm text-gray-800 mb-3">Referral Context</h3>
                <p className="text-xs text-gray-600 whitespace-pre-wrap leading-relaxed">{r.reason}</p>
              </div>
            )}

            <div className="bg-white p-6 rounded-xl border border-gray-200/80 shadow-sm">
              <h3 className="font-bold text-sm text-gray-800 mb-4">Notes</h3>
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
                <p className="text-xs text-gray-400 mb-4">No notes have been recorded yet.</p>
              )}

              {r.status === 'Open' && (
                <div className="flex items-center gap-2 pt-4 border-t border-gray-100">
                  <input
                    type="text"
                    value={noteText}
                    onChange={(e) => setNoteText(e.target.value)}
                    placeholder="Add a note..."
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-xs"
                  />
                  <button
                    onClick={handleAddNote}
                    disabled={!noteText.trim() || addNote.loading}
                    className="flex items-center gap-1.5 px-4 py-2 bg-[#519BCE] hover:bg-[#4686b3] text-white rounded-lg text-xs font-semibold transition disabled:opacity-60 shrink-0"
                  >
                    <Send size={13} />
                    {addNote.loading ? 'Sending...' : 'Add'}
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-6">
            {(metadata.outcome || r.status === 'Open') && (
              <div className="bg-white p-5 rounded-xl border border-gray-200/80 shadow-sm space-y-3">
                <h3 className="font-bold text-sm text-gray-800">Actions</h3>

                {metadata.outcome && (
                  <div className="flex items-center gap-1.5 text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 w-fit">
                    <FileCheck size={14} />
                    <span className="font-semibold">Outcome: {metadata.outcome}</span>
                  </div>
                )}

                {r.status === 'Open' && !metadata.hearingRequested && (
                  <button
                    onClick={handleRequestHearing}
                    disabled={requestHearing.loading}
                    className="w-full flex items-center justify-center gap-1.5 px-3 py-2.5 border border-indigo-300 text-indigo-700 hover:bg-indigo-50 rounded-lg text-xs font-semibold transition disabled:opacity-60"
                  >
                    <Gavel size={14} />
                    {requestHearing.loading ? 'Filing...' : 'File Expedited Hearing Request'}
                  </button>
                )}

                {r.status === 'Open' && !metadata.outcome && (
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={outcomeText}
                      onChange={(e) => setOutcomeText(e.target.value)}
                      placeholder="Record final outcome (e.g. conviction, sentence)..."
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-xs"
                    />
                    <button
                      onClick={handleRecordOutcome}
                      disabled={!outcomeText.trim() || recordOutcome.loading}
                      className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold transition disabled:opacity-60"
                    >
                      <FileCheck size={13} />
                      {recordOutcome.loading ? 'Saving...' : 'Record Outcome'}
                    </button>
                  </div>
                )}
              </div>
            )}

            {r.status === 'Open' && <AssignTaskCard userId={r.userId} referralId={referralId} />}
          </div>
        </div>
      </div>
    </StaffLayout>
  );
}
