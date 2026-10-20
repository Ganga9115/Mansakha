import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import { usePageHeader } from '../../shared/context/PageHeaderContext';
import CaseHeader from '../components/CaseHeader';
import CaseSubNav from '../components/CaseSubNav';
import { Send } from 'lucide-react';
import { useCaseDetail, useAddCaseNote, useMarkInvestigationComplete } from '../services/hooks';

// Investigating Officer's Activity Log - the internal, private investigative
// record (raw evidence, leads, interview notes). Deliberately never shown
// to the victim - only the curated Investigation Progress summary on
// CaseDetail.jsx is. Same case_notes table Counsellors already use for
// their own case notes, scoped here to notes this officer themselves wrote.

export default function CaseLog() {
  const { userId } = useParams();
  const [noteText, setNoteText] = useState('');
  const [actionError, setActionError] = useState(null);
  const detailQuery = useCaseDetail(userId);
  const addNote = useAddCaseNote();
  const markComplete = useMarkInvestigationComplete();

  usePageHeader({ title: 'Activity Log' });

  const c = detailQuery.data;

  if (detailQuery.loading) {
    return <p className="text-sm text-gray-400">Loading...</p>;
  }
  if (detailQuery.error || !c) {
    return (
      <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm px-4 py-3 rounded-lg">
        {detailQuery.error || 'This case could not be located.'}
      </div>
    );
  }

  const handleAddNote = async () => {
    if (!noteText.trim()) return;
    setActionError(null);
    try {
      await addNote.mutate(userId, noteText.trim());
      setNoteText('');
      detailQuery.refetch();
    } catch (err) {
      setActionError(err.message || 'Could not add note. Kindly try again.');
    }
  };

  const handleMarkComplete = async () => {
    setActionError(null);
    try {
      await markComplete.mutate(userId);
      detailQuery.refetch();
    } catch (err) {
      setActionError(err.message || 'Could not mark investigation complete. Kindly try again.');
    }
  };

  return (
    <>
      <div className="space-y-4">
        <CaseHeader c={c} backTo="/io" backLabel="Back to Case Queue" onMarkComplete={handleMarkComplete} markCompleteLoading={markComplete.loading} />
        <CaseSubNav base={`/io/cases/${userId}`} />

        {actionError && <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs px-4 py-3 rounded-lg">{actionError}</div>}

        <div className="bg-white p-6 rounded-xl border border-gray-200/80 shadow-sm max-w-2xl">
          <h3 className="font-bold text-sm text-gray-800 mb-1">Internal Investigation Notes</h3>
          <p className="text-[11px] text-gray-400 mb-4">Private to you - raw evidence, leads, and interview notes. Never shown to the victim.</p>
          {c.notes?.length > 0 ? (
            <div className="space-y-3 mb-4">
              {c.notes.map((n) => (
                <div key={n.noteId} className="border border-gray-200 rounded-lg p-3">
                  <p className="text-xs text-gray-700 whitespace-pre-wrap leading-relaxed">{n.noteText}</p>
                  <p className="text-[10px] text-gray-400 mt-1.5">{new Date(n.createdAt).toLocaleString()}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-gray-400 mb-4">No notes have been recorded yet.</p>
          )}

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
        </div>
      </div>
    </>
  );
}
