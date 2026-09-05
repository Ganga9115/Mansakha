-- Mansakha Mail: internal, Gmail-like staff communication (Counsellor,
-- District/State/National Admin, Data Operator, Ministry). Entirely internal
-- to this database - no real SMTP/internet email, no external delivery.
-- Keeps staff-to-staff correspondence inside the same audit-log/RBAC
-- boundary that already protects case data, instead of routing it through
-- personal email accounts outside the system's control.

create table mail_threads (
  thread_id   uuid primary key default gen_random_uuid(),
  subject     text not null,
  created_by  uuid not null references officials(official_id),
  created_at  timestamptz not null default now()
);

-- sent_at null = still a draft. sender_deleted_at is a soft-delete from the
-- SENDER's own Sent view only - a recipient's copy is independently removed
-- via their own mail_recipients.deleted_at, matching messages.read_at's
-- existing "nullable timestamp = hasn't happened yet" idiom used elsewhere.
create table mail_messages (
  message_id         uuid primary key default gen_random_uuid(),
  thread_id          uuid not null references mail_threads(thread_id),
  sender_id          uuid not null references officials(official_id),
  body               text not null default '',
  sent_at            timestamptz,
  sender_deleted_at  timestamptz,
  created_at         timestamptz not null default now()
);

-- One row per recipient per message - gives true per-participant read/
-- archive/delete state instead of one global flag, the same way a real
-- inbox works (my copy of a message is independent of everyone else's).
create table mail_recipients (
  mail_recipient_id  uuid primary key default gen_random_uuid(),
  message_id         uuid not null references mail_messages(message_id),
  official_id        uuid not null references officials(official_id),
  recipient_type     text not null default 'to' check (recipient_type in ('to', 'cc')),
  read_at            timestamptz,
  archived_at        timestamptz,
  deleted_at         timestamptz,
  unique (message_id, official_id)
);

create table mail_attachments (
  attachment_id     uuid primary key default gen_random_uuid(),
  message_id        uuid not null references mail_messages(message_id),
  file_name         text not null,
  storage_path      text not null,
  content_type      text,
  file_size_bytes   integer,
  uploaded_at       timestamptz not null default now()
);

create index idx_mail_messages_thread on mail_messages(thread_id, sent_at);
create index idx_mail_messages_sender_sent on mail_messages(sender_id, sent_at desc) where sent_at is not null and sender_deleted_at is null;
create index idx_mail_recipients_official_inbox on mail_recipients(official_id) where deleted_at is null and archived_at is null;
create index idx_mail_recipients_message on mail_recipients(message_id);
create index idx_mail_attachments_message on mail_attachments(message_id);
