import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import StaffLayout from '../layouts/StaffLayout';
import { ArrowLeft, CheckCircle2, Send, ClipboardList, ShieldAlert } from 'lucide-react';
import { useReferralDetail, useAddReferralNote, useResolveReferral, useSetAccusedStatus } from '../services/hooks';
import { useCreateTask } from '../services/taskHooks';

// Must match backend/src/core/services/threatAssessment.js's ACCUSED_STATUSES exactly.
const ACCUSED_STATUSES = ['In Custody', 'Out on Bail', 'Absconding', 'Convicted'];

// Deliberately NOT the distress score's Low/Moderate/High/Critical palette -
// Threat Tier is a different axis (external danger, not psychological
// distress) and must never be visually confused with it.
const THREAT_TIER_BADGE = {
  Routine: 'bg-gray-100 text-gray-600',
  Guarded: 'bg-yellow-100 text-yellow-700',
  Elevated: 'bg-orange-100 text-orange-700',
  Severe: 'bg-rose-100 text-rose-700',
};

// Threat assessment card - IO's actual statutory function. Sets Accused
// Status (a real structured field, not a free-text guess); Threat Tier is
// then computed server-side from that + genuine sos_events history and
// shown here read-only, since it's derived, not directly editable.
function ThreatAssessmentCard({ r, referralId, onChanged }) {
  const [accusedStatus, setAccusedStatus] = useState(r.accusedStatus || '');
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const setStatus = useSetAccusedStatus();

  const handleSubmit = async () => {
    if (!accusedStatus) return;
    setError(null);
    setSuccess(false);
    try {
      await setStatus.mutate(referralId, accusedStatus);
      setSuccess(true);
      onChanged();
    } catch (err) {
      setError(err.message || 'Unable to update accused status. Kindly try again.');
    }
  };

  return (
    <div className="bg-white p-5 rounded-xl border border-gray-200/80 shadow-sm space-y-3">
      <div className="flex items-center gap-1.5">
        <ShieldAlert size={15} className="text-[#3D5A80]" />
        <h3 className="font-bold text-sm text-gray-800">Threat Assessment</h3>
      </div>
      <p className="text-[11px] text-gray-400">A separate axis from the victim's own distress score - this measures external risk from the accused. Protection Officer acts on the resulting tier.</p>

      <div className="flex items-center gap-2 flex-wrap">
        {r.threatTier ? (
          <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold ${THREAT_TIER_BADGE[r.threatTier] || 'bg-gray-100 text-gray-600'}`}>
            {r.threatTier}
          </span>
        ) : (
          <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-gray-100 text-gray-500">Not yet assessed</span>
        )}
        <span className="text-[11px] text-gray-400">
          {r.sosEventCount7d > 0 ? `${r.sosEventCount7d} SOS alert(s) in the last 7 days` : 'No SOS alerts in the last 7 days'}
        </span>
      </div>

      <div>
        <label className="text-[10px] font-bold text-gray-500 uppercase block mb-1">Accused Status</label>
        <select
          value={accusedStatus}
          onChange={(e) => setAccusedStatus(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs"
        >
          <option value="" disabled>Select status...</option>
          {ACCUSED_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      <button
        onClick={handleSubmit}
        disabled={!accusedStatus || setStatus.loading}
        className="w-full flex items-center justify-center gap-1.5 px-3 py-2.5 bg-[#3D5A80] hover:bg-[#2f4763] text-white rounded-lg text-xs font-semibold transition disabled:opacity-60"
      >
        {setStatus.loading ? 'Updating...' : 'Update Accused Status'}
      </button>
      {error && <p className="text-xs text-rose-600">{error}</p>}
      {success && <p className="text-xs text-emerald-600">Accused status updated. Threat tier recalculated.</p>}
    </div>
  );
}

// Roles a task may be assigned to - independent of this portal's own role,
// so a directive can be raised for any concerned office, not only this one.
const TASK_ASSIGNABLE_ROLES = [
  'District Welfare Officer', 'Investigating Officer', 'Protection Officer',
  'DLSA Coordinator', 'Special Public Prosecutor', 'District Collector', 'Rehabilitation Officer',
];

// Assign a structured, trackable action item to any concerned office for
// this case - always-visible card on the Detail page (previously a toggled
// disclosure buried inside the list row). Copied verbatim from
// dwo/pages/ReferralDetail.jsx (the template).
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

// Investigating Officer's Referral Detail - the full case record for one
// referral: context, the FIR/chargesheet/bail status log, and every action
// (Resolve, Assign Task), laid out as proper sections rather than crammed
// into an accordion. Mirrors dwo/pages/ReferralDetail.jsx (the template);
// this role has no extra role-specific action beyond notes/resolve/assign.

const STATUS_BADGE = { Open: 'bg-amber-100 text-amber-700', Resolved: 'bg-emerald-100 text-emerald-700' };

export default function ReferralDetail() {
  const { referralId } = useParams();
  const navigate = useNavigate();
  const [noteText, setNoteText] = useState('');
  const [actionError, setActionError] = useState(null);
  const detailQuery = useReferralDetail(referralId);
  const addNote = useAddReferralNote();
  const resolve = useResolveReferral();

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
      navigate('/io');
    } catch (err) {
      setActionError(err.message || 'Could not resolve this referral. Kindly try again.');
    }
  };

  return (
    <StaffLayout title="Referral Detail">
      <div className="space-y-6">
        <button onClick={() => navigate('/io')} className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-gray-700 transition">
          <ArrowLeft size={14} /> Back to Case Status Feed
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
              <h3 className="font-bold text-sm text-gray-800 mb-4">FIR / Chargesheet / Bail Status Log</h3>
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
                <p className="text-xs text-gray-400 mb-4">No status updates logged yet.</p>
              )}

              {r.status === 'Open' && (
                <div className="flex items-center gap-2 pt-4 border-t border-gray-100">
                  <input
                    type="text"
                    value={noteText}
                    onChange={(e) => setNoteText(e.target.value)}
                    placeholder="e.g. Chargesheet filed / accused granted bail..."
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
            <ThreatAssessmentCard r={r} referralId={referralId} onChanged={detailQuery.refetch} />
            {r.status === 'Open' && <AssignTaskCard userId={r.userId} referralId={referralId} />}
          </div>
        </div>
      </div>
    </StaffLayout>
  );
}
