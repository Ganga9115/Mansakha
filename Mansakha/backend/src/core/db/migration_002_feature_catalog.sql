-- Mansakha migration 002: Feature Catalog completion
--
-- Run ONCE against the live Supabase project (SQL Editor -> New query -> paste
-- -> Run). supabase-js's REST client (what the Express backend itself uses)
-- can't execute DDL, so this can't be applied by the running application - it
-- has to be run directly against Postgres, same as schema.sql and
-- security_and_realtime.sql were. Written to be safe to re-run (IF NOT
-- EXISTS / IF EXISTS / ON CONFLICT DO NOTHING throughout) in case it's ever
-- partially applied and re-run.
--
-- schema.sql has also been updated to include everything below inline, so a
-- brand-new project setup only needs schema.sql + security_and_realtime.sql;
-- this file is specifically for bringing an ALREADY-PROVISIONED database
-- (the one already running this project) up to the same shape.

-- ===== 1.1 Victim login model: docket+name+state+district replaces OTP =====
-- Email OTP is no longer used by any route - orphaned table, safe to drop.
-- (Phone OTP never had its own table - Twilio Verify owned that state.)
drop table if exists email_otp_codes;

-- victims.auth_method now records who PROVISIONED the record (District Admin
-- vs Data Intake Admin), not an OTP method - old values kept in the
-- allow-list for rows created before this change, new values added alongside.
alter table victims drop constraint if exists victims_auth_method_check;
alter table victims add constraint victims_auth_method_check
  check (auth_method in ('mobile_otp', 'email_otp', 'google', 'district_admin', 'data_intake_admin'));

-- ===== 1.3 AI Chat: persisted conversation history =====
create table if not exists chat_messages (
  message_id  uuid primary key default gen_random_uuid(),
  victim_id    uuid not null references victims(victim_id),
  sender        text not null check (sender in ('victim', 'ai')),
  body           text not null,
  sent_at         timestamptz not null default now()
);
create index if not exists idx_chat_messages_victim on chat_messages(victim_id, sent_at);

-- ===== 1.3 SMS check-in opt-in preference =====
alter table victims add column if not exists sms_checkin_enabled boolean not null default false;

-- ===== 2.2 Case background/backstory =====
alter table victims add column if not exists case_background text;

-- ===== 1.4 Counsellor preference + in-app victim<->official messaging =====
alter table victims add column if not exists opted_for_manual_counsellor boolean not null default false;

create table if not exists messages (
  message_id  uuid primary key default gen_random_uuid(),
  victim_id    uuid not null references victims(victim_id),
  official_id   uuid not null references officials(official_id),
  sender_type    text not null check (sender_type in ('victim', 'official')),
  body            text not null,
  sent_at          timestamptz not null default now()
);
create index if not exists idx_messages_victim on messages(victim_id, sent_at);
create index if not exists idx_messages_official on messages(official_id, sent_at);

-- ===== 1.5 Stress-Level Automated Response =====
-- victims.assigned_counsellor_id: schema.sql documented this as already
-- added by an earlier pass (for workload reporting), but live-verification
-- during this migration found it was NEVER ACTUALLY APPLIED to the database
-- (schema.sql had drifted from the live schema) - confirmed via a direct
-- 42703 "column does not exist" error, not an assumption. Added here for
-- real, alongside the officials.profile_image_url column that WAS correctly
-- applied in that same earlier pass (verified present).
alter table victims add column if not exists assigned_counsellor_id uuid references officials(official_id);

-- SOS - a victim-triggered emergency event, deliberately its own lightweight
-- table, NOT routed through interactions/distress_scores/alerts (no AI
-- scoring, no fabricated score value). Must be created before
-- alert_notifications gets a sos_event_id FK below.
create table if not exists sos_events (
  sos_event_id  uuid primary key default gen_random_uuid(),
  victim_id      uuid not null references victims(victim_id),
  triggered_at    timestamptz not null default now(),
  resolved_at       timestamptz,
  resolved_by         uuid references officials(official_id)
);
create index if not exists idx_sos_events_victim on sos_events(victim_id, triggered_at desc);

-- alert_notifications now backs EITHER a distress-score alert OR an SOS
-- event, never both - alert_id becomes nullable, sos_event_id is added, and
-- an XOR check constraint enforces exactly one is set. Existing rows all
-- have alert_id set and sos_event_id null, so they satisfy the new
-- constraint without any data fix-up.
alter table alert_notifications alter column alert_id drop not null;
alter table alert_notifications add column if not exists sos_event_id uuid references sos_events(sos_event_id);
alter table alert_notifications add column if not exists source text not null default 'distress_score' check (source in ('distress_score', 'sos'));
alter table alert_notifications add column if not exists priority text not null default 'normal' check (priority in ('normal', 'urgent'));
alter table alert_notifications add column if not exists auto_assigned boolean not null default false;
alter table alert_notifications drop constraint if exists alert_notifications_alert_xor_sos;
alter table alert_notifications add constraint alert_notifications_alert_xor_sos check (
  (alert_id is not null and sos_event_id is null) or (alert_id is null and sos_event_id is not null)
);

-- dispatch_queue.kind's check constraint needs the new queue-entry types
-- Section 1.3/1.5 introduce. Constraint name follows Postgres's default
-- <table>_<column>_check naming (schema.sql gave it no explicit name).
alter table dispatch_queue drop constraint if exists dispatch_queue_kind_check;
alter table dispatch_queue add constraint dispatch_queue_kind_check
  check (kind in ('checkin_due', 'alert', 'ivrs_call', 'sms_checkin_prompt', 'wellness_push', 'ai_proactive_contact'));

-- ===== 1.6 Wellness & Self-Care =====
create table if not exists wellness_content (
  content_id       uuid primary key default gen_random_uuid(),
  category          text not null check (category in ('exercise', 'meditation', 'music')),
  title              text not null,
  body                jsonb not null, -- exercise/music: {text, url?}; meditation: {steps:[{instruction, durationSeconds}]}
  language_id           uuid references languages(language_id),
  duration_seconds        int, -- meditation only: total session length
  created_at                timestamptz not null default now()
);
create index if not exists idx_wellness_content_category on wellness_content(category);

create table if not exists journal_entries (
  entry_id      uuid primary key default gen_random_uuid(),
  victim_id      uuid not null references victims(victim_id),
  content         text not null,
  language_id       uuid references languages(language_id),
  sentiment_score     numeric, -- -1..+1, reuses services/gemini.js's existing sentiment
                                -- extraction - reflection-only, does NOT feed distress_scores
  created_at            timestamptz not null default now()
);
create index if not exists idx_journal_entries_victim on journal_entries(victim_id, created_at desc);

-- ===== 2.2 Scheduled counsellings =====
create table if not exists counselling_sessions (
  session_id    uuid primary key default gen_random_uuid(),
  victim_id      uuid not null references victims(victim_id),
  counsellor_id   uuid not null references officials(official_id),
  scheduled_at      timestamptz not null,
  status              text not null default 'upcoming' check (status in ('upcoming', 'completed', 'cancelled')),
  created_at            timestamptz not null default now()
);
create index if not exists idx_counselling_sessions_counsellor on counselling_sessions(counsellor_id, scheduled_at);

-- ===== 2.3 AI-drafted vs manual case notes =====
alter table case_notes add column if not exists authored_by text not null default 'manual' check (authored_by in ('manual', 'ai'));
-- An AI-drafted note (auto-generated right after a check-in, before any
-- Counsellor has reviewed/edited it) has no official_id yet.
alter table case_notes alter column official_id drop not null;

-- ===== 3.6/4.4/6.3 Reports (District/State/National -> Ministry) =====
create table if not exists reports (
  report_id       uuid primary key default gen_random_uuid(),
  jurisdiction_id  uuid not null references jurisdictions(jurisdiction_id),
  generated_by      uuid not null references officials(official_id),
  generated_at        timestamptz not null default now(),
  period_start          timestamptz not null,
  period_end              timestamptz not null,
  snapshot                  jsonb not null
);
create index if not exists idx_reports_jurisdiction on reports(jurisdiction_id, generated_at desc);

-- ===== 6.4 Ministry-manageable lookups: soft delete, matching languages' pattern =====
alter table case_types add column if not exists deleted_at timestamptz;
alter table intervention_types add column if not exists deleted_at timestamptz;
alter table channels add column if not exists deleted_at timestamptz;

-- ===== 7. Data Intake & Integration Admin role (dedicated role, not a scoped Administration variant) =====
alter table roles drop constraint if exists roles_role_name_check;
alter table roles add constraint roles_role_name_check
  check (role_name in ('Ministry', 'Administration', 'Counsellor', 'Data Intake Admin'));
insert into roles (role_name) values ('Data Intake Admin') on conflict (role_name) do nothing;

-- ===== RLS on every new table - deny-all, matches security_and_realtime.sql's
-- existing pattern exactly (service_role bypasses this; only closes direct
-- anon/authenticated-key access, e.g. from the frontend's own Supabase client) =====
alter table chat_messages enable row level security;
alter table messages enable row level security;
alter table wellness_content enable row level security;
alter table journal_entries enable row level security;
alter table counselling_sessions enable row level security;
alter table reports enable row level security;
alter table sos_events enable row level security;
