import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { usePageHeader } from '../../shared/context/PageHeaderContext';
import ReferralHeader from '../components/ReferralHeader';
import ReferralSubNav from '../components/ReferralSubNav';
import { Send } from 'lucide-react';
import { useReferralDetail, useAddReferralNote, useResolveReferral } from '../services/hooks';

// District Welfare Officer's Activity Log - the notes thread, on its own
// page with real room instead of one card among several. THE TEMPLATE for
// the other 6 role folders' equivalent Log page.

export default function ReferralLog() {
  const { referralId } = useParams();
  const navigate = useNavigate();
  const [noteText, setNoteText] = useState('');
  const [actionError, setActionError] = useState(null);
  const detailQuery = useReferralDetail(referralId);
  const addNote = useAddReferralNote();
  const resolve = useResolveReferral();

  usePageHeader({ title: 'Activity Log' });

  const r = detailQuery.data;

  if (detailQuery.loading) {
    return <p className="text-sm text-gray-400">Loading...</p>;
  }
  if (detailQuery.error || !r) {
    return (
      <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm px-4 py-3 rounded-lg">
        {detailQuery.error || 'This referral could not be located.'}
      </div>
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
      navigate('/dwo');
    } catch (err) {
      setActionError(err.message || 'Could not resolve this referral. Kindly try again.');
    }
  };

  return (
    <>
      <div className="space-y-4">
        <ReferralHeader r={r} backTo="/dwo" backLabel="Back to Referral Queue" onResolve={handleResolve} resolveLoading={resolve.loading} />
        <ReferralSubNav base={`/dwo/referrals/${referralId}`} />

        {actionError && <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs px-4 py-3 rounded-lg">{actionError}</div>}

        <div className="bg-white p-6 rounded-xl border border-gray-200/80 shadow-sm max-w-2xl">
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
    </>
  );
}
