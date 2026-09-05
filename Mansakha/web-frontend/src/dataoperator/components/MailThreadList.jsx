import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Paperclip, Search, Archive, ArchiveRestore, Trash2 } from 'lucide-react';
import { useMailActions } from '../services/hooks';

// Gmail-style compact single-line rows: everything (sender, subject,
// snippet, attachment flag, date) reads on one line, with archive/delete
// quick-actions that only reveal on hover - the previous version stacked
// this across 3 lines per row and had no inline actions at all.
function formatRelative(iso) {
  if (!iso) return '';
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

// folder: 'inbox' | 'sent' | 'archived' - controls which quick-actions make
// sense (archiving only applies to a recipient copy, so it's hidden in Sent;
// Archived swaps the icon to "restore to Inbox").
export default function MailThreadList({ threads, loading, q, onSearchChange, basePath, folder, onActionDone, emptyLabel }) {
  const navigate = useNavigate();
  const actions = useMailActions();

  const handleAction = async (e, fn, threadId) => {
    e.stopPropagation();
    try {
      await fn(threadId);
      onActionDone?.();
    } catch {
      // best-effort - list just doesn't refresh if this failed
    }
  };

  return (
    <div className="h-full flex flex-col bg-white rounded-xl border border-gray-200/80 shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 shrink-0">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={q}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search mail..."
            className="w-full pl-9 pr-3 py-2 bg-[#F8F9FA] rounded-full text-gray-700 text-xs font-medium border-none focus:outline-none focus:ring-1 focus:ring-[#519BCE]"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
        {loading ? (
          <p className="px-6 py-8 text-xs text-gray-400 text-center">Loading...</p>
        ) : threads.length === 0 ? (
          <p className="px-6 py-8 text-xs text-gray-400 text-center">{emptyLabel}</p>
        ) : threads.map((t) => (
          <div
            key={t.threadId}
            onClick={() => navigate(`${basePath}/thread/${t.threadId}`)}
            className={`group flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-gray-50/80 hover:shadow-sm transition ${t.unread ? 'bg-[#EBF4FA]/40' : ''}`}
          >
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${t.unread ? 'bg-[#519BCE]' : 'bg-transparent'}`} />

            <span className={`w-36 shrink-0 truncate text-sm ${t.unread ? 'font-bold text-gray-900' : 'font-medium text-gray-600'}`}>
              {t.latestSenderName}
            </span>

            <span className="flex-1 min-w-0 truncate text-sm">
              <span className={t.unread ? 'font-semibold text-gray-900' : 'text-gray-700'}>{t.subject}</span>
              <span className="text-gray-400"> — {t.snippet}</span>
            </span>

            {t.attachmentCount > 0 && <Paperclip size={13} className="text-gray-400 shrink-0" />}

            {/* Quick actions - swap in for the date on hover, same slot */}
            <span className="shrink-0 w-14 flex items-center justify-end">
              <span className="hidden group-hover:flex items-center gap-1">
                {folder !== 'sent' && (
                  <button
                    onClick={(e) => handleAction(e, folder === 'archived' ? actions.unarchiveThread : actions.archiveThread, t.threadId)}
                    className="p-1.5 rounded-full text-gray-400 hover:bg-gray-200 hover:text-[#3D5A80] transition"
                    title={folder === 'archived' ? 'Move to Inbox' : 'Archive'}
                    aria-label={folder === 'archived' ? 'Move to Inbox' : 'Archive'}
                  >
                    {folder === 'archived' ? <ArchiveRestore size={14} /> : <Archive size={14} />}
                  </button>
                )}
                <button
                  onClick={(e) => handleAction(e, actions.deleteThread, t.threadId)}
                  className="p-1.5 rounded-full text-gray-400 hover:bg-rose-100 hover:text-rose-600 transition"
                  title="Delete"
                  aria-label="Delete"
                >
                  <Trash2 size={14} />
                </button>
              </span>
              <span className="text-[11px] text-gray-400 group-hover:hidden">{formatRelative(t.latestSentAt)}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
