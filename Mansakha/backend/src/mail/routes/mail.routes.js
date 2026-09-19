const express = require('express');
const multer = require('multer');
const crypto = require('crypto');
const { supabase } = require('../../core/db/supabaseClient');
const { pool, withTransaction } = require('../../core/db/pgPool');
const { verifyToken } = require('../../core/middleware/verifyToken');
const { requireRole } = require('../../core/middleware/requireRole');
const { generalApiLimiter } = require('../../core/middleware/rateLimiter');
const { ok, fail } = require('../../core/services/responseEnvelope');
const { writeAuditLog } = require('../../core/services/auditLog');

// Mansakha Mail - internal, Gmail-like staff communication (Counsellor,
// District/State/National Admin, Ministry). Entirely internal
// to this database - no real SMTP/internet email, no external delivery.
// Every action rides the same audit-log/RBAC machinery that already
// protects case data, instead of routing staff correspondence through
// personal email accounts outside the system's control. See
// migration_023_mansakha_mail.sql for the schema this file reads/writes.

const router = express.Router();

// Any authenticated official can use Mail - deliberately no
// requireJurisdiction anywhere in this file. Only case/victim data is
// jurisdiction-scoped in this system; staff directory/communication already
// isn't (e.g. Ministry's own staff-list route returns every official
// regardless of jurisdiction).
router.use(verifyToken, requireRole(['Ministry', 'Administration', 'Counsellor']), generalApiLimiter);

const PAGE_SIZE = 20;
const ATTACHMENT_URL_TTL_SECONDS = 3600;
const ATTACHMENT_MAX_BYTES = 15 * 1024 * 1024;

// Same escaping this codebase already uses before interpolating a search
// term into ilike (dataoperator.routes.js's /search-person) - prevents a
// literal %/_ in someone's search text from acting as an unintended wildcard.
function escapeIlike(q) {
  return q.replace(/[%_\\]/g, '\\$&');
}

const attachmentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: ATTACHMENT_MAX_BYTES },
  fileFilter: (req, file, cb) => {
    const allowed = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'image/png', 'image/jpeg',
      'text/plain', 'text/csv',
      'application/zip', 'application/x-zip-compressed',
    ];
    if (!allowed.includes(file.mimetype)) return cb(new Error('File type not allowed'));
    cb(null, true);
  },
});

function sanitizeFileName(name) {
  return String(name || 'file').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
}

async function getAttachmentSignedUrl(storagePath) {
  const { data, error } = await supabase.storage.from('mail-attachments').createSignedUrl(storagePath, ATTACHMENT_URL_TTL_SECONDS);
  return error ? null : data.signedUrl;
}

// Confirms the caller is either the message's sender or holds a live
// (not deleted) mail_recipients row on it - the one check every
// message/attachment-scoped route in this file relies on.
async function canAccessMessage(client, messageId, officialId) {
  const { rows } = await client.query(
    `select mm.sender_id,
            exists (select 1 from mail_recipients mr where mr.message_id = mm.message_id and mr.official_id = $2 and mr.deleted_at is null) as is_recipient
     from mail_messages mm where mm.message_id = $1`,
    [messageId, officialId]
  );
  if (!rows[0]) return false;
  return rows[0].sender_id === officialId || rows[0].is_recipient;
}

// Recipient picker - matches this codebase's existing name/role/jurisdiction
// staff-lookup shape (Ministry's own staff-list route), just scoped to
// search rather than a full roster dump.
router.get('/directory', async (req, res) => {
  const q = (req.query.q || '').trim();
  const page = Math.max(1, Number(req.query.page) || 1);
  const offset = (page - 1) * PAGE_SIZE;
  if (q.length < 2) return ok(res, { officials: [] });
  const escaped = `%${escapeIlike(q)}%`;

  const { rows } = await pool.query(
    `select o.official_id, o.full_name, o.email, r.role_name, j.name as jurisdiction_name
     from officials o
     join official_roles orr on orr.official_id = o.official_id and orr.revoked_at is null
     join roles r on r.role_id = orr.role_id
     left join jurisdictions j on j.jurisdiction_id = orr.jurisdiction_id
     where o.official_id != $3 and (o.full_name ilike $1 or o.email ilike $1)
     order by o.full_name
     limit $2 offset $4`,
    [escaped, PAGE_SIZE, req.auth.officialId, offset]
  );

  return ok(res, {
    officials: rows.map((r) => ({
      officialId: r.official_id,
      fullName: r.full_name,
      email: r.email,
      roleName: r.role_name,
      jurisdictionName: r.jurisdiction_name || null,
    })),
  });
});

// Shared by /inbox and /sent - only the membership `exists()` clause differs
// (see membershipClause below), everything else is identical: the thread's
// TRUE latest sent message via a LATERAL join, plus a per-caller unread flag.
async function listThreads({ officialId, q, page, membershipClause }) {
  const offset = (Math.max(1, page) - 1) * PAGE_SIZE;
  const params = [officialId, PAGE_SIZE, offset];
  let searchClause = '';
  if (q && q.trim()) {
    params.push(`%${escapeIlike(q.trim())}%`);
    searchClause = `and (t.subject ilike $${params.length} or latest.body ilike $${params.length})`;
  }

  const { rows } = await pool.query(
    `select t.thread_id, t.subject, latest.body, latest.sent_at, latest.sender_id, so.full_name as latest_sender_name,
            (select count(*) from mail_attachments ma where ma.message_id = latest.message_id) as latest_attachment_count,
            exists (
              select 1 from mail_recipients mr join mail_messages mm on mm.message_id = mr.message_id
              where mm.thread_id = t.thread_id and mr.official_id = $1
                and mr.read_at is null and mr.deleted_at is null and mm.sent_at is not null
            ) as unread
     from mail_threads t
     join lateral (
       select * from mail_messages mm2
       where mm2.thread_id = t.thread_id and mm2.sent_at is not null
       order by mm2.sent_at desc limit 1
     ) latest on true
     join officials so on so.official_id = latest.sender_id
     where ${membershipClause} ${searchClause}
     order by latest.sent_at desc
     limit $2 offset $3`,
    params
  );

  return rows.map((r) => ({
    threadId: r.thread_id,
    subject: r.subject,
    snippet: (r.body || '').slice(0, 140),
    latestSenderName: r.latest_sender_name,
    latestSentAt: r.sent_at,
    unread: r.unread,
    attachmentCount: Number(r.latest_attachment_count) || 0,
  }));
}

router.get('/inbox', async (req, res) => {
  const threads = await listThreads({
    officialId: req.auth.officialId,
    q: req.query.q,
    page: Number(req.query.page) || 1,
    membershipClause: `exists (
      select 1 from mail_recipients mr join mail_messages mm on mm.message_id = mr.message_id
      where mm.thread_id = t.thread_id and mr.official_id = $1 and mr.deleted_at is null and mr.archived_at is null
    )`,
  });
  return ok(res, { threads });
});

router.get('/sent', async (req, res) => {
  const threads = await listThreads({
    officialId: req.auth.officialId,
    q: req.query.q,
    page: Number(req.query.page) || 1,
    membershipClause: `exists (
      select 1 from mail_messages mm where mm.thread_id = t.thread_id and mm.sender_id = $1 and mm.sent_at is not null and mm.sender_deleted_at is null
    )`,
  });
  return ok(res, { threads });
});

// Gmail-parity "Archived" folder - same recipient membership as /inbox,
// just the opposite predicate on archived_at, so a thread always lives in
// exactly one of Inbox/Archived (never both, never neither) for as long as
// this recipient hasn't deleted it.
router.get('/archived', async (req, res) => {
  const threads = await listThreads({
    officialId: req.auth.officialId,
    q: req.query.q,
    page: Number(req.query.page) || 1,
    membershipClause: `exists (
      select 1 from mail_recipients mr join mail_messages mm on mm.message_id = mr.message_id
      where mm.thread_id = t.thread_id and mr.official_id = $1 and mr.deleted_at is null and mr.archived_at is not null
    )`,
  });
  return ok(res, { threads });
});

router.get('/unread-count', async (req, res) => {
  const { rows } = await pool.query(
    `select count(distinct mm.thread_id) as count
     from mail_recipients mr join mail_messages mm on mm.message_id = mr.message_id
     where mr.official_id = $1 and mr.read_at is null and mr.deleted_at is null and mm.sent_at is not null`,
    [req.auth.officialId]
  );
  return ok(res, { count: Number(rows[0]?.count) || 0 });
});

router.get('/threads/:threadId', async (req, res) => {
  const { threadId } = req.params;

  const { rows: threadRows } = await pool.query('select thread_id, subject from mail_threads where thread_id = $1', [threadId]);
  if (!threadRows[0]) return fail(res, 'Thread not found', 404);

  const { rows: messages } = await pool.query(
    `select mm.message_id, mm.body, mm.sent_at, mm.created_at, mm.sender_id, o.full_name as sender_name,
            exists (select 1 from mail_recipients mr where mr.message_id = mm.message_id and mr.official_id = $2 and mr.deleted_at is null) as im_recipient
     from mail_messages mm
     join officials o on o.official_id = mm.sender_id
     where mm.thread_id = $1 and mm.sent_at is not null
       and (mm.sender_id = $2 or exists (select 1 from mail_recipients mr where mr.message_id = mm.message_id and mr.official_id = $2))
     order by mm.sent_at asc`,
    [threadId, req.auth.officialId]
  );
  if (messages.length === 0) return fail(res, 'Thread not found', 404);

  const messageIds = messages.map((m) => m.message_id);
  const { rows: attachmentRows } = messageIds.length
    ? await pool.query(
        `select attachment_id, message_id, file_name, content_type, file_size_bytes from mail_attachments where message_id = any($1::uuid[]) order by uploaded_at`,
        [messageIds]
      )
    : { rows: [] };
  const attachmentsByMessage = new Map();
  for (const a of attachmentRows) {
    if (!attachmentsByMessage.has(a.message_id)) attachmentsByMessage.set(a.message_id, []);
    attachmentsByMessage.get(a.message_id).push({ attachmentId: a.attachment_id, fileName: a.file_name, contentType: a.content_type, fileSizeBytes: a.file_size_bytes });
  }

  const { rows: recipientRows } = await pool.query(
    `select mr.official_id, o.full_name, mr.recipient_type
     from mail_recipients mr join officials o on o.official_id = mr.official_id
     join mail_messages mm on mm.message_id = mr.message_id
     where mm.thread_id = $1
     group by mr.official_id, o.full_name, mr.recipient_type`,
    [threadId]
  );

  // Whether THIS thread currently sits in my Archived folder, so the
  // frontend can show "Archive" vs "Move to Inbox" correctly - null when
  // I'm not a recipient at all (e.g. viewing my own Sent-only thread),
  // where archiving doesn't apply.
  const { rows: archiveState } = await pool.query(
    `select
       exists (select 1 from mail_recipients mr join mail_messages mm on mm.message_id = mr.message_id where mm.thread_id = $1 and mr.official_id = $2 and mr.deleted_at is null) as has_any,
       exists (select 1 from mail_recipients mr join mail_messages mm on mm.message_id = mr.message_id where mm.thread_id = $1 and mr.official_id = $2 and mr.deleted_at is null and mr.archived_at is null) as has_unarchived`,
    [threadId, req.auth.officialId]
  );
  const archivedByMe = archiveState[0].has_any ? !archiveState[0].has_unarchived : null;

  // Mark my own unread rows in this thread as read - side effect of opening it.
  await pool.query(
    `update mail_recipients set read_at = now()
     where official_id = $2 and read_at is null
       and message_id in (select message_id from mail_messages where thread_id = $1)`,
    [threadId, req.auth.officialId]
  );

  await writeAuditLog({ officialId: req.auth.officialId, action: 'read', entityType: 'mail_thread', entityId: threadId });

  return ok(res, {
    threadId,
    subject: threadRows[0].subject,
    archivedByMe,
    participants: recipientRows.map((r) => ({ officialId: r.official_id, fullName: r.full_name, type: r.recipient_type })),
    messages: messages.map((m) => ({
      messageId: m.message_id,
      senderId: m.sender_id,
      senderName: m.sender_name,
      body: m.body,
      sentAt: m.sent_at,
      attachments: attachmentsByMessage.get(m.message_id) || [],
    })),
  });
});

// Compose a new thread or reply to an existing one. asDraft:true leaves
// sent_at null so an attachment upload has a real message_id to attach to
// before the actual "Send" click.
router.post('/messages', async (req, res) => {
  const { threadId, subject, body, recipientOfficialIds, asDraft } = req.body;
  if (!body || !body.trim()) return fail(res, 'body is required', 400);

  try {
    const result = await withTransaction(async (client) => {
      let resolvedThreadId = threadId;
      let resolvedRecipientIds = Array.isArray(recipientOfficialIds) ? recipientOfficialIds : [];

      if (resolvedThreadId) {
        // Reply - recipients inherited from the thread (every other
        // participant besides me), matching real email "Reply" behaviour;
        // an explicit recipientOfficialIds on a reply is ignored.
        const { rows: threadCheck } = await client.query('select thread_id from mail_threads where thread_id = $1', [resolvedThreadId]);
        if (!threadCheck[0]) throw Object.assign(new Error('Thread not found'), { status: 404 });

        const { rows: participantRows } = await client.query(
          `select distinct official_id from mail_recipients mr join mail_messages mm on mm.message_id = mr.message_id where mm.thread_id = $1
           union select distinct sender_id from mail_messages where thread_id = $1`,
          [resolvedThreadId]
        );
        resolvedRecipientIds = participantRows.map((r) => r.official_id).filter((id) => id !== req.auth.officialId);
      } else {
        if (!subject || !subject.trim()) throw Object.assign(new Error('subject is required for a new thread'), { status: 400 });
        if (resolvedRecipientIds.length === 0) throw Object.assign(new Error('At least one recipient is required'), { status: 400 });
        const { rows: threadInsert } = await client.query(
          'insert into mail_threads (subject, created_by) values ($1, $2) returning thread_id',
          [subject.trim(), req.auth.officialId]
        );
        resolvedThreadId = threadInsert[0].thread_id;
      }

      const sentAt = asDraft ? null : new Date();
      const { rows: messageInsert } = await client.query(
        'insert into mail_messages (thread_id, sender_id, body, sent_at) values ($1, $2, $3, $4) returning message_id, sent_at',
        [resolvedThreadId, req.auth.officialId, body.trim(), sentAt]
      );
      const messageId = messageInsert[0].message_id;

      if (resolvedRecipientIds.length > 0) {
        const values = resolvedRecipientIds.map((_, i) => `($1, $${i + 2})`).join(', ');
        await client.query(`insert into mail_recipients (message_id, official_id) values ${values}`, [messageId, ...resolvedRecipientIds]);
      }

      return { threadId: resolvedThreadId, messageId, sentAt: messageInsert[0].sent_at };
    });

    if (result.sentAt) {
      await writeAuditLog({ officialId: req.auth.officialId, action: 'send', entityType: 'mail_message', entityId: result.messageId });
    }
    return ok(res, result, result.sentAt ? 'Message sent' : 'Draft saved', 201);
  } catch (err) {
    return fail(res, err.message, err.status || 500);
  }
});

router.patch('/messages/:messageId', async (req, res) => {
  const { messageId } = req.params;
  const { body } = req.body;
  const { rows } = await pool.query('select sender_id, sent_at from mail_messages where message_id = $1', [messageId]);
  if (!rows[0]) return fail(res, 'Message not found', 404);
  if (rows[0].sender_id !== req.auth.officialId) return fail(res, 'Not your draft', 403);
  if (rows[0].sent_at) return fail(res, 'Cannot edit a message that has already been sent', 400);

  await pool.query('update mail_messages set body = $1 where message_id = $2', [body || '', messageId]);
  return ok(res, null, 'Draft updated');
});

router.post('/messages/:messageId/send', async (req, res) => {
  const { messageId } = req.params;
  const { rows } = await pool.query('select sender_id, sent_at from mail_messages where message_id = $1', [messageId]);
  if (!rows[0]) return fail(res, 'Message not found', 404);
  if (rows[0].sender_id !== req.auth.officialId) return fail(res, 'Not your draft', 403);
  if (rows[0].sent_at) return fail(res, 'Already sent', 400);

  const { rows: recipientCheck } = await pool.query('select 1 from mail_recipients where message_id = $1 limit 1', [messageId]);
  if (recipientCheck.length === 0) return fail(res, 'At least one recipient is required', 400);

  await pool.query('update mail_messages set sent_at = now() where message_id = $1', [messageId]);
  await writeAuditLog({ officialId: req.auth.officialId, action: 'send', entityType: 'mail_message', entityId: messageId });
  return ok(res, null, 'Message sent');
});

router.delete('/messages/:messageId', async (req, res) => {
  const { messageId } = req.params;
  const { rows } = await pool.query('select sender_id, sent_at from mail_messages where message_id = $1', [messageId]);
  if (!rows[0]) return fail(res, 'Message not found', 404);
  if (rows[0].sender_id !== req.auth.officialId) return fail(res, 'Not your draft', 403);
  if (rows[0].sent_at) return fail(res, 'Cannot delete a message that has already been sent', 400);

  await pool.query('delete from mail_messages where message_id = $1', [messageId]);
  return ok(res, null, 'Draft deleted');
});

router.get('/drafts', async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const offset = (page - 1) * PAGE_SIZE;
  const { rows } = await pool.query(
    `select mm.message_id, mm.body, mm.created_at, mt.subject
     from mail_messages mm join mail_threads mt on mt.thread_id = mm.thread_id
     where mm.sender_id = $1 and mm.sent_at is null
     order by mm.created_at desc limit $2 offset $3`,
    [req.auth.officialId, PAGE_SIZE, offset]
  );
  return ok(res, { drafts: rows.map((r) => ({ messageId: r.message_id, subject: r.subject, body: r.body, createdAt: r.created_at })) });
});

router.post('/messages/:messageId/attachments', attachmentUpload.single('file'), async (req, res) => {
  const { messageId } = req.params;
  if (!req.file) return fail(res, 'file is required', 400);

  const { rows } = await pool.query('select sender_id, sent_at, thread_id from mail_messages where message_id = $1', [messageId]);
  if (!rows[0]) return fail(res, 'Message not found', 404);
  if (rows[0].sender_id !== req.auth.officialId) return fail(res, 'Not your draft', 403);
  if (rows[0].sent_at) return fail(res, 'Cannot attach a file to a message that has already been sent', 400);

  const attachmentId = crypto.randomUUID();
  const storagePath = `mail/${rows[0].thread_id}/${messageId}/${attachmentId}-${sanitizeFileName(req.file.originalname)}`;

  const { error: uploadError } = await supabase.storage.from('mail-attachments').upload(storagePath, req.file.buffer, { contentType: req.file.mimetype });
  if (uploadError) return fail(res, `Could not upload attachment: ${uploadError.message}`, 500);

  const { data, error } = await supabase
    .from('mail_attachments')
    .insert({ attachment_id: attachmentId, message_id: messageId, file_name: req.file.originalname, storage_path: storagePath, content_type: req.file.mimetype, file_size_bytes: req.file.size })
    .select('attachment_id')
    .single();
  if (error) return fail(res, `Could not record attachment: ${error.message}`, 500);

  return ok(res, { attachmentId: data.attachment_id }, 'Attachment uploaded', 201);
});

router.delete('/messages/:messageId/attachments/:attachmentId', async (req, res) => {
  const { messageId, attachmentId } = req.params;
  const { rows } = await pool.query('select sender_id, sent_at from mail_messages where message_id = $1', [messageId]);
  if (!rows[0]) return fail(res, 'Message not found', 404);
  if (rows[0].sender_id !== req.auth.officialId) return fail(res, 'Not your draft', 403);
  if (rows[0].sent_at) return fail(res, 'Cannot remove an attachment from a message that has already been sent', 400);

  const { rows: attachmentRows } = await pool.query('select storage_path from mail_attachments where attachment_id = $1 and message_id = $2', [attachmentId, messageId]);
  if (!attachmentRows[0]) return fail(res, 'Attachment not found', 404);

  await supabase.storage.from('mail-attachments').remove([attachmentRows[0].storage_path]);
  await pool.query('delete from mail_attachments where attachment_id = $1', [attachmentId]);
  return ok(res, null, 'Attachment removed');
});

router.get('/attachments/:attachmentId', async (req, res) => {
  const { attachmentId } = req.params;
  const { rows } = await pool.query('select message_id, storage_path from mail_attachments where attachment_id = $1', [attachmentId]);
  if (!rows[0]) return fail(res, 'Attachment not found', 404);

  const hasAccess = await canAccessMessage(pool, rows[0].message_id, req.auth.officialId);
  if (!hasAccess) return fail(res, 'Attachment not found', 404);

  const signedUrl = await getAttachmentSignedUrl(rows[0].storage_path);
  if (!signedUrl) return fail(res, 'Could not generate download link', 500);

  await writeAuditLog({ officialId: req.auth.officialId, action: 'download', entityType: 'mail_attachment', entityId: attachmentId });
  return ok(res, { signedUrl });
});

router.patch('/threads/:threadId/read', async (req, res) => {
  await pool.query(
    `update mail_recipients set read_at = now() where official_id = $2 and read_at is null
     and message_id in (select message_id from mail_messages where thread_id = $1)`,
    [req.params.threadId, req.auth.officialId]
  );
  return ok(res, null, 'Marked read');
});

router.patch('/threads/:threadId/unread', async (req, res) => {
  await pool.query(
    `update mail_recipients set read_at = null where official_id = $2
     and message_id in (select message_id from mail_messages where thread_id = $1)`,
    [req.params.threadId, req.auth.officialId]
  );
  return ok(res, null, 'Marked unread');
});

router.patch('/threads/:threadId/archive', async (req, res) => {
  await pool.query(
    `update mail_recipients set archived_at = now() where official_id = $2 and archived_at is null
     and message_id in (select message_id from mail_messages where thread_id = $1)`,
    [req.params.threadId, req.auth.officialId]
  );
  return ok(res, null, 'Archived');
});

router.patch('/threads/:threadId/unarchive', async (req, res) => {
  await pool.query(
    `update mail_recipients set archived_at = null where official_id = $2
     and message_id in (select message_id from mail_messages where thread_id = $1)`,
    [req.params.threadId, req.auth.officialId]
  );
  return ok(res, null, 'Unarchived');
});

// Soft-deletes from MY view only - sender's own sent copy vs. a recipient's
// own inbox copy are independent, same as the rest of this file's model.
router.delete('/threads/:threadId', async (req, res) => {
  const { threadId } = req.params;
  await pool.query(
    `update mail_messages set sender_deleted_at = now()
     where thread_id = $1 and sender_id = $2 and sender_deleted_at is null`,
    [threadId, req.auth.officialId]
  );
  await pool.query(
    `update mail_recipients set deleted_at = now() where official_id = $2 and deleted_at is null
     and message_id in (select message_id from mail_messages where thread_id = $1)`,
    [threadId, req.auth.officialId]
  );
  await writeAuditLog({ officialId: req.auth.officialId, action: 'delete', entityType: 'mail_thread', entityId: threadId });
  return ok(res, null, 'Deleted');
});

module.exports = router;
