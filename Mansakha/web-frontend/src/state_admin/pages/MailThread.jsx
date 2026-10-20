import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Paperclip, Archive, ArchiveRestore, Trash2, MailX, Send, Loader2 } from 'lucide-react';
import MailShell from '../components/MailShell';
import { useMailThread, useMailActions, useMe } from '../services/hooks';
import { useToast } from '../../shared/context/ToastContext';

function formatTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export default function MailThread() {
  const { threadId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { data: me } = useMe();
  const { data, loading, refetch } = useMailThread(threadId);
  const actions = useMailActions();
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [downloadingId, setDownloadingId] = useState(null);

  // Reply box always sits at the thread's own bottom, so the page should
  // land there on open/refresh rather than at the (usually longer) top of
  // an old conversation.
  useEffect(() => {
    if (data) window.scrollTo({ top: document.body.scrollHeight });
  }, [data]);

  const handleReply = async () => {
    if (!reply.trim()) return;
    setSending(true);
    try {
      await actions.composeOrReply({ threadId, body: reply.trim() });
      setReply('');
      refetch();
    } catch (err) {
      toast.error(err.message || 'Could not send reply');
    } finally {
      setSending(false);
    }
  };

  const handleDownload = async (attachmentId) => {
    setDownloadingId(attachmentId);
    try {
      const result = await actions.getAttachmentUrl(attachmentId);
      window.open(result.signedUrl, '_blank', 'noopener');
    } catch (err) {
      toast.error(err.message || 'Could not open attachment');
    } finally {
      setDownloadingId(null);
    }
  };

  const handleToggleArchive = async () => {
    try {
      if (data?.archivedByMe) {
        await actions.unarchiveThread(threadId);
        toast.success('Moved to Inbox');
      } else {
        await actions.archiveThread(threadId);
        toast.success('Thread archived');
      }
      navigate('/stateadmin/mail');
    } catch (err) {
      toast.error(err.message || 'Could not update thread');
    }
  };

  const handleMarkUnread = async () => {
    try {
      await actions.markThreadUnread(threadId);
      navigate('/stateadmin/mail');
    } catch (err) {
      toast.error(err.message || 'Could not mark unread');
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('Delete this thread from your Mail? This only removes it from your own view.')) return;
    try {
      await actions.deleteThread(threadId);
      toast.success('Thread deleted');
      navigate('/stateadmin/mail');
    } catch (err) {
      toast.error(err.message || 'Could not delete thread');
    }
  };

  return (
    <MailShell
      basePath="/stateadmin/mail"
      title={data?.subject || 'Mail'}
      headerAction={
        data && (
          <div className="flex items-center gap-1">
            <button onClick={handleMarkUnread} className="p-2 rounded-full text-gray-400 hover:bg-gray-100 hover:text-brand-900 transition" title="Mark as unread" aria-label="Mark as unread">
              <MailX size={17} />
            </button>
            {data.archivedByMe !== null && (
              <button onClick={handleToggleArchive} className="p-2 rounded-full text-gray-400 hover:bg-gray-100 hover:text-brand-900 transition" title={data.archivedByMe ? 'Move to Inbox' : 'Archive'} aria-label={data.archivedByMe ? 'Move to Inbox' : 'Archive'}>
                {data.archivedByMe ? <ArchiveRestore size={17} /> : <Archive size={17} />}
              </button>
            )}
            <button onClick={handleDelete} className="p-2 rounded-full text-gray-400 hover:bg-rose-50 hover:text-rose-600 transition" title="Delete" aria-label="Delete">
              <Trash2 size={17} />
            </button>
          </div>
        )
      }
    >
      <div className="flex flex-col h-full bg-white rounded-xl border border-gray-200/80 shadow-sm overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-2 border-b border-gray-200 bg-brand-50/60 shrink-0">
          <button
            onClick={() => navigate('/stateadmin/mail')}
            className="p-1.5 -ml-1 rounded-full hover:bg-white/70 transition text-brand-900"
            aria-label="Back to Mail"
          >
            <ArrowLeft size={20} />
          </button>
          {data?.participants && (
            <p className="text-xs text-gray-500 truncate">
              {data.participants.map((p) => p.fullName).join(', ')}
            </p>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 no-scrollbar">
          {loading && !data ? (
            <p className="text-xs text-gray-400">Loading...</p>
          ) : (data?.messages || []).map((m) => {
            const isMine = m.senderId === me?.officialId;
            return (
              <div key={m.messageId} className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}>
                <div className={`max-w-[80%] px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${isMine ? 'bg-brand-700 text-white rounded-tr-sm' : 'bg-gray-100 text-gray-800 rounded-tl-sm'}`}>
                  {!isMine && <p className="text-xs font-bold mb-1 opacity-80">{m.senderName}</p>}
                  {m.body}
                  {m.attachments.length > 0 && (
                    <div className={`mt-2 space-y-1.5 ${isMine ? '' : ''}`}>
                      {m.attachments.map((a) => (
                        <button
                          key={a.attachmentId}
                          onClick={() => handleDownload(a.attachmentId)}
                          disabled={downloadingId === a.attachmentId}
                          className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs transition ${isMine ? 'bg-white/15 hover:bg-white/25' : 'bg-white border border-gray-200 hover:bg-gray-50'}`}
                        >
                          {downloadingId === a.attachmentId ? <Loader2 size={13} className="animate-spin shrink-0" /> : <Paperclip size={13} className="shrink-0" />}
                          <span className="truncate flex-1 text-left">{a.fileName}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <span className="text-[10px] text-gray-400 mt-1 px-1">{formatTime(m.sentAt)}</span>
              </div>
            );
          })}
        </div>

        <div className="border-t border-gray-200 bg-gray-50 px-3 py-3 shrink-0">
          <div className="flex items-end gap-2 bg-white rounded-2xl border border-gray-200 shadow-sm px-3 py-2">
            <textarea
              rows={1}
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleReply(); } }}
              placeholder="Write a reply..."
              className="flex-1 px-2 py-1.5 bg-transparent border-0 outline-none resize-none text-sm max-h-32 overflow-y-auto"
            />
            <button
              onClick={handleReply}
              disabled={sending || !reply.trim()}
              className="shrink-0 p-2.5 rounded-full bg-brand-700 hover:bg-brand-800 text-white disabled:opacity-40 transition"
              aria-label="Send reply"
              title="Send reply"
            >
              {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            </button>
          </div>
        </div>
      </div>
    </MailShell>
  );
}
