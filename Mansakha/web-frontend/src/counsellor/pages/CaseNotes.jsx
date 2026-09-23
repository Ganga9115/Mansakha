import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { usePageHeader } from '../../shared/context/PageHeaderContext';
import { ArrowLeft } from 'lucide-react';
import { useCaseNotes, useAddCaseNote, useCaseDetail } from '../services/hooks';

// Own page rather than an inline card on CaseDetail.jsx - a case can
// accumulate many notes (including every AI-drafted one per check-in), and
// having the full thread expanded inline pushed everything else on the case
// file below the fold. CaseDetail now just links here via a single
// "Case Notes ->" row.
export default function CaseNotes() {
  const { id: userId } = useParams();
  const caseDetailQuery = useCaseDetail(userId);
  usePageHeader({ title: `Case Notes: ${caseDetailQuery.data?.docketNumber || userId.slice(0, 8)}` });
  const navigate = useNavigate();
  const notesQuery = useCaseNotes(userId);
  const addNote = useAddCaseNote(userId);
  const [noteText, setNoteText] = useState('');

  const handleAddNote = async () => {
    if (!noteText.trim()) return;
    await addNote.mutate(noteText.trim());
    setNoteText('');
    notesQuery.refetch();
  };

  return (
    <>
      <div className="space-y-4">
        <button
          onClick={() => navigate(`/counsellor/case-detail/${userId}`)}
          className="flex items-center gap-2 text-xs font-semibold text-brand-600 hover:underline"
        >
          <ArrowLeft size={14} /> Back to Case File
        </button>

        <div className="bg-white p-4 sm:p-6 rounded-xl border border-gray-200/80 shadow-sm space-y-4">
          <h3 className="font-bold text-sm text-gray-800">Case Notes</h3>

          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddNote()}
              placeholder="Add a note..."
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-xs"
            />
            <button
              onClick={handleAddNote}
              disabled={addNote.loading}
              className="px-4 py-2 bg-brand-700 text-white rounded-lg text-xs font-medium disabled:opacity-60 shrink-0"
            >
              Add
            </button>
          </div>

          {/* Newest first (the API already returns them ordered this way,
              `order by created_at desc`) - a note thread reads like a recent-
              activity feed, not a chat transcript. */}
          {notesQuery.loading ? (
            <p className="text-xs text-gray-400">Loading notes...</p>
          ) : (notesQuery.data?.notes || []).length === 0 ? (
            <p className="text-xs text-gray-400">No notes yet.</p>
          ) : (
            <div className="space-y-3 text-xs pt-2 border-t border-gray-100">
              {notesQuery.data.notes.map((n) => (
                <div key={n.noteId} className="border-b border-gray-50 pb-2">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-gray-400 mb-1">
                    <span className="font-semibold text-gray-600">{n.authorName}</span>
                    {n.authoredBy === 'ai' && (
                      <span className="px-1.5 py-0.5 rounded bg-brand-50 text-brand-900 text-[9px] font-bold uppercase">AI-drafted</span>
                    )}
                    <span className="text-[11px]">{new Date(n.createdAt).toLocaleString()}</span>
                  </div>
                  <p className="text-gray-700 whitespace-pre-wrap">{n.noteText}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
