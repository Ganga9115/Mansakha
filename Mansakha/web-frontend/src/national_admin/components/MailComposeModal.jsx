import React, { useEffect, useRef, useState } from 'react';
import { X, Paperclip, Send, Loader2, FileText } from 'lucide-react';
import { useMailDirectory, useMailActions } from '../services/hooks';
import { useToast } from '../../shared/context/ToastContext';

// New-thread compose - overlay modal, same shape as StaffLayout's logout
// confirm / NotificationBell's detail view. A draft only gets created in the
// backend the moment an attachment is added (mail.routes.js requires a
// subject + >=1 recipient before a draft can exist at all, so "draft on
// first keystroke" isn't reachable pre-that) - a plain send with no
// attachment skips the draft round-trip entirely and posts once.
export default function MailComposeModal({ onClose, onSent }) {
  const toast = useToast();
  const { composeOrReply, updateDraft, sendDraft, deleteDraft, uploadAttachment, removeAttachment } = useMailActions();

  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [recipients, setRecipients] = useState([]); // [{officialId, fullName, roleName, jurisdictionName}]
  const [recipientQuery, setRecipientQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [showResults, setShowResults] = useState(false);
  const { data: directoryData, loading: directoryLoading } = useMailDirectory(debouncedQuery);
  const results = (directoryData?.officials || []).filter((o) => !recipients.some((r) => r.officialId === o.officialId));

  const [draftMessageId, setDraftMessageId] = useState(null);
  const [attachments, setAttachments] = useState([]); // [{attachmentId, fileName}]
  const [attaching, setAttaching] = useState(false);
  const [sending, setSending] = useState(false);
  const fileInputRef = useRef(null);
  const pickerRef = useRef(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(recipientQuery), 250);
    return () => clearTimeout(t);
  }, [recipientQuery]);

  useEffect(() => {
    function handleClickOutside(e) {
      if (pickerRef.current && !pickerRef.current.contains(e.target)) setShowResults(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const addRecipient = (official) => {
    setRecipients((r) => [...r, official]);
    setRecipientQuery('');
    setShowResults(false);
  };

  const removeRecipient = (officialId) => {
    setRecipients((r) => r.filter((x) => x.officialId !== officialId));
  };

  // A draft can only be created once subject + >=1 recipient exist (the
  // backend rejects a new thread without both) - this is the shared gate
  // both "attach a file" and "send" go through.
  const ensureDraft = async () => {
    if (draftMessageId) return draftMessageId;
    if (!subject.trim()) { toast.error('Add a subject first'); return null; }
    if (recipients.length === 0) { toast.error('Add at least one recipient first'); return null; }
    const result = await composeOrReply({
      subject: subject.trim(),
      body: body.trim(),
      recipientOfficialIds: recipients.map((r) => r.officialId),
      asDraft: true,
    });
    setDraftMessageId(result.messageId);
    return result.messageId;
  };

  const handleAttachClick = () => fileInputRef.current?.click();

  const handleFileSelected = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setAttaching(true);
    try {
      const messageId = await ensureDraft();
      if (!messageId) return;
      const result = await uploadAttachment(messageId, file);
      setAttachments((a) => [...a, { attachmentId: result.attachmentId, fileName: file.name }]);
    } catch (err) {
      toast.error(err.message || 'Could not attach file');
    } finally {
      setAttaching(false);
    }
  };

  const handleRemoveAttachment = async (attachmentId) => {
    if (!draftMessageId) return;
    try {
      await removeAttachment(draftMessageId, attachmentId);
      setAttachments((a) => a.filter((x) => x.attachmentId !== attachmentId));
    } catch (err) {
      toast.error(err.message || 'Could not remove attachment');
    }
  };

  const handleSend = async () => {
    if (!subject.trim()) return toast.error('Add a subject');
    if (recipients.length === 0) return toast.error('Add at least one recipient');
    if (!body.trim() && attachments.length === 0) return toast.error('Write a message or attach a file');

    setSending(true);
    try {
      if (draftMessageId) {
        await updateDraft(draftMessageId, body.trim());
        await sendDraft(draftMessageId);
      } else {
        await composeOrReply({
          subject: subject.trim(),
          body: body.trim(),
          recipientOfficialIds: recipients.map((r) => r.officialId),
        });
      }
      toast.success('Message sent');
      onSent?.();
    } catch (err) {
      toast.error(err.message || 'Could not send message');
    } finally {
      setSending(false);
    }
  };

  // Leaving a draft with an attachment behind (unsent) would just clutter
  // Drafts forever with no way the current UI surfaces to clean it up -
  // discard it on cancel instead, best-effort.
  const handleClose = () => {
    if (draftMessageId) deleteDraft(draftMessageId).catch(() => {});
    onClose();
  };

  return (
    // Two layers, not one: the dim+blur backdrop covers the ENTIRE screen
    // (sidebar included), but the card itself is centered only within the
    // visible white content area to the right of the sidebar (lg:left-64) -
    // a single `fixed inset-0` div can't do both at once, since offsetting
    // it to skip the sidebar would leave the sidebar undimmed too.
    <>
      <div className="fixed inset-0 z-50 bg-black/40" aria-hidden="true" />
      <div className="fixed inset-0 lg:left-64 z-50 flex items-center justify-center p-4 pointer-events-none">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg flex flex-col max-h-[90vh] pointer-events-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <h3 className="text-lg font-bold text-gray-800">New Message</h3>
          <button onClick={handleClose} className="text-gray-400 hover:text-gray-600" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
          {/* Recipient picker */}
          <div className="relative" ref={pickerRef}>
            <div className="flex flex-wrap items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-lg focus-within:ring-1 focus-within:ring-[#519BCE]">
              {recipients.map((r) => (
                <span key={r.officialId} className="flex items-center gap-1 bg-[#EBF4FA] text-[#3D5A80] text-xs font-medium px-2 py-1 rounded-full">
                  {r.fullName} — {r.roleName}{r.jurisdictionName ? `, ${r.jurisdictionName}` : ''}
                  <button onClick={() => removeRecipient(r.officialId)} className="hover:text-rose-600" aria-label={`Remove ${r.fullName}`}>
                    <X size={12} />
                  </button>
                </span>
              ))}
              <input
                type="text"
                value={recipientQuery}
                onChange={(e) => { setRecipientQuery(e.target.value); setShowResults(true); }}
                onFocus={() => setShowResults(true)}
                placeholder={recipients.length === 0 ? 'To: search by name or email...' : 'Add more...'}
                className="flex-1 min-w-[120px] text-sm outline-none py-0.5"
              />
            </div>
            {showResults && recipientQuery.trim().length >= 2 && (
              <div className="absolute left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-10 max-h-48 overflow-y-auto">
                {directoryLoading ? (
                  <p className="px-3 py-3 text-xs text-gray-400">Searching...</p>
                ) : results.length === 0 ? (
                  <p className="px-3 py-3 text-xs text-gray-400">No matching staff found.</p>
                ) : results.map((o) => (
                  <button
                    key={o.officialId}
                    onClick={() => addRecipient(o)}
                    className="w-full text-left px-3 py-2 hover:bg-gray-50 transition"
                  >
                    <p className="text-xs font-medium text-gray-800">{o.fullName}</p>
                    <p className="text-[11px] text-gray-400">{o.roleName}{o.jurisdictionName ? ` · ${o.jurisdictionName}` : ''} · {o.email}</p>
                  </button>
                ))}
              </div>
            )}
          </div>

          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Subject"
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-medium outline-none focus:ring-1 focus:ring-[#519BCE]"
          />

          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Write your message..."
            rows={8}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none resize-none focus:ring-1 focus:ring-[#519BCE]"
          />

          {attachments.length > 0 && (
            <div className="space-y-1.5">
              {attachments.map((a) => (
                <div key={a.attachmentId} className="flex items-center gap-2 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs">
                  <FileText size={14} className="text-gray-400 shrink-0" />
                  <span className="flex-1 truncate text-gray-700">{a.fileName}</span>
                  <button onClick={() => handleRemoveAttachment(a.attachmentId)} className="text-gray-400 hover:text-rose-600 shrink-0" aria-label={`Remove ${a.fileName}`}>
                    <X size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 shrink-0">
          <input ref={fileInputRef} type="file" onChange={handleFileSelected} className="hidden" />
          <button
            onClick={handleAttachClick}
            disabled={attaching}
            className="p-2 rounded-full text-gray-500 hover:bg-gray-100 transition disabled:opacity-50"
            aria-label="Attach file"
            title="Attach file"
          >
            {attaching ? <Loader2 size={18} className="animate-spin" /> : <Paperclip size={18} />}
          </button>
          <button
            onClick={handleSend}
            disabled={sending}
            className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium text-white bg-[#519BCE] hover:bg-[#3d83b3] disabled:opacity-50 transition"
          >
            {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            Send
          </button>
        </div>
      </div>
      </div>
    </>
  );
}
