import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import StaffLayout from '../layouts/StaffLayout';
import { ArrowLeft, CheckCircle2, Send, Gavel, UserCheck, ClipboardList } from 'lucide-react';
import { useReferralDetail, useAddReferralNote, useResolveReferral, useAssignLawyer, useMarkTrialReady } from '../services/hooks';
import {  } from '../services/taskHooks';


// Assign a structured, trackable action item to any concerned office for
// this case - always-visible card on the Detail page (previously a toggled
// disclosure buried inside the list row). Copied verbatim from
// dwo/pages/ReferralDetail.jsx's identical component.
// No "Assign Action Item" here. This role delivers a service on a case - it
// has no statutory authority to direct another department. Under the PoA
// Act the district officer who CAN issue cross-departmental directives is
// the District Collector (district executive head, chair of the Act's own
// district-level vigilance and monitoring committee), and that role keeps
// this capability. The card and the backend POST /tasks behind it were
// inherited from the shared role template, not chosen for this role.
const STATUS_BADGE = { Open: 'bg-amber-100 text-amber-700', Resolved: 'bg-emerald-100 text-emerald-700' };

export default function ReferralDetail() {
  const { referralId } = useParams();
  const navigate = useNavigate();
  const [noteText, setNoteText] = useState('');
  const [lawyerName, setLawyerName] = useState('');
  const [actionError, setActionError] = useState(null);
  const detailQuery = useReferralDetail(referralId);
  const addNote = useAddReferralNote();
  const resolve = useResolveReferral();
  const assignLawyer = useAssignLawyer();
  const markTrialReady = useMarkTrialReady();

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
  const slaOverdue = metadata.slaDeadline && !metadata.assignedLawyer && new Date(metadata.slaDeadline) < new Date();

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
      navigate('/dlsa');
    } catch (err) {
      setActionError(err.message || 'Could not resolve this referral. Kindly try again.');
    }
  };

  const handleAssignLawyer = async () => {
    if (!lawyerName.trim()) return;
    setActionError(null);
    try {
      await assignLawyer.mutate(referralId, lawyerName.trim());
      setLawyerName('');
      detailQuery.refetch();
    } catch (err) {
      setActionError(err.message || 'Could not assign lawyer. Kindly try again.');
    }
  };

  const handleMarkTrialReady = async () => {
    setActionError(null);
    try {
      await markTrialReady.mutate(referralId);
      navigate('/dlsa');
    } catch (err) {
      setActionError(err.message || 'Could not hand off to Prosecutor. Kindly try again.');
    }
  };

  return (
    <StaffLayout title="Referral Detail">
      <div className="space-y-6">
        <button onClick={() => navigate('/dlsa')} className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-gray-700 transition">
          <ArrowLeft size={14} /> Back to Legal Aid Queue
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
                    className="flex items-center gap-1.5 px-4 py-2 bg-brand-700 hover:bg-brand-800 text-white rounded-lg text-xs font-semibold transition disabled:opacity-60 shrink-0"
                  >
                    <Send size={13} />
                    {addNote.loading ? 'Sending...' : 'Add'}
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-6">
            {(metadata.assignedLawyer || r.status === 'Open') && (
              <div className="bg-white p-5 rounded-xl border border-gray-200/80 shadow-sm space-y-3">
                <h3 className="font-bold text-sm text-gray-800">Actions</h3>

                {metadata.assignedLawyer ? (
                  <div className="flex items-center gap-1.5 text-sky-700 bg-sky-50 border border-sky-200 rounded-lg px-3 py-2 w-fit">
                    <UserCheck size={14} />
                    <span className="font-semibold">{metadata.assignedLawyer}</span>
                    {metadata.slaDeadline && <span className="text-sky-500">- assigned within SLA</span>}
                  </div>
                ) : (
                  r.status === 'Open' && (
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={lawyerName}
                        onChange={(e) => setLawyerName(e.target.value)}
                        placeholder="Panel lawyer name..."
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-xs"
                      />
                      <button
                        onClick={handleAssignLawyer}
                        disabled={!lawyerName.trim() || assignLawyer.loading}
                        className="flex items-center gap-1.5 px-3 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-xs font-semibold transition disabled:opacity-60"
                      >
                        <UserCheck size={13} />
                        {assignLawyer.loading ? 'Assigning...' : 'Assign Lawyer'}
                      </button>
                    </div>
                  )
                )}
                {slaOverdue && <p className="text-xs text-rose-600 font-semibold">48h assignment SLA has passed.</p>}

                {r.status === 'Open' && (
                  <button
                    onClick={handleMarkTrialReady}
                    disabled={markTrialReady.loading}
                    className="w-full flex items-center justify-center gap-1.5 px-3 py-2.5 border border-brand-900 text-brand-900 hover:bg-brand-50 rounded-lg text-xs font-semibold transition disabled:opacity-60"
                  >
                    <Gavel size={14} />
                    {markTrialReady.loading ? 'Handing off...' : 'Mark Trial-Ready (hand off to Prosecutor)'}
                  </button>
                )}
              </div>
            )}

          </div>
        </div>
      </div>
    </StaffLayout>
  );
}
