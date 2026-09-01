-- Adds voice-message support to the existing user<->counsellor `messages`
-- table (WhatsApp-style: record, upload, play back with a duration). A
-- voice message has no text body - audio_path/duration_seconds are used
-- instead, so body must become nullable rather than staying `not null`.
begin;

alter table messages
  alter column body drop not null;

alter table messages
  add column if not exists message_type text not null default 'text' check (message_type in ('text', 'voice')),
  add column if not exists audio_path text,
  add column if not exists duration_seconds integer;

-- A voice message stores its audio in Supabase Storage (private bucket,
-- signed URLs generated per-fetch - see user.routes.js/counsellor.routes.js)
-- rather than the DB, same pattern as profile-photos already uses for
-- images in security_and_realtime.sql - except this bucket is NOT public,
-- since these are private counsellor<->user conversations.
insert into storage.buckets (id, name, public)
values ('voice-messages', 'voice-messages', false)
on conflict (id) do nothing;

commit;
