-- Defense-in-depth: enable Row Level Security with NO policies (deny-all) on every
-- table, for the anon/authenticated Supabase roles. The backend always queries with
-- the service_role key, which bypasses RLS by design - so this changes nothing for
-- the Express API. What it closes: any direct query or Realtime subscription made
-- with the anon/publishable key (e.g. from the frontend) gets zero rows, instead of
-- relying solely on Express's requireJurisdiction middleware never having a bug.
--
-- This was found while confirming that jurisdiction isolation (a District Admin
-- only sees their district, a State Admin only their state) actually holds in the
-- DB and frontend, not just in Express - it did not, until this file.

alter table jurisdictions enable row level security;
alter table roles enable row level security;
alter table case_types enable row level security;
alter table channels enable row level security;
alter table signal_types enable row level security;
alter table risk_levels enable row level security;
alter table alert_statuses enable row level security;
alter table intervention_types enable row level security;
alter table languages enable row level security;
alter table officials enable row level security;
alter table official_roles enable row level security;
alter table users enable row level security;
alter table user_identity enable row level security;
alter table consent_records enable row level security;
alter table interactions enable row level security;
alter table interaction_signals enable row level security;
alter table distress_scores enable row level security;
alter table alerts enable row level security;
alter table alert_notifications enable row level security;
alter table interventions enable row level security;
alter table audit_log enable row level security;
alter table case_notes enable row level security;
alter table dispatch_queue enable row level security;
alter table chat_messages enable row level security;
alter table messages enable row level security;
alter table wellness_content enable row level security;
alter table journal_entries enable row level security;
alter table counselling_sessions enable row level security;
alter table reports enable row level security;
alter table sos_events enable row level security;

-- Realtime publication for the alerts tables. Safe to enable even with deny-all RLS
-- above: Supabase Realtime enforces RLS on postgres_changes subscriptions, so an
-- anon-key subscription still gets nothing until/unless a scoped policy is added
-- deliberately later. The frontend should NOT rely on this yet (see
-- frontend/src/services/supabaseClient.js) - poll the Express alert endpoints
-- instead, which already apply requireJurisdiction correctly.
alter publication supabase_realtime add table alerts, alert_notifications;

-- Storage bucket for staff profile photos (POST /api/me/profile-photo).
-- Public read (photos aren't sensitive; showing them in a header/sidebar
-- needs a plain URL) - writes only ever happen via the backend's
-- service_role key, which bypasses storage RLS same as every other table,
-- so no write policy is added here.
insert into storage.buckets (id, name, public)
values ('profile-photos', 'profile-photos', true)
on conflict (id) do nothing;

-- Storage bucket for voice messages (POST /api/user/messages/voice,
-- POST /api/counsellor/cases/:userId/messages/voice) - NOT public, unlike
-- profile-photos: these are private counsellor<->user conversations, so
-- playback always goes through a short-lived signed URL the backend
-- generates per-fetch (see getVoiceMessageUrl in both routes files), never
-- a permanent public link. Writes only ever happen via the backend's
-- service_role key, same as profile-photos.
insert into storage.buckets (id, name, public)
values ('voice-messages', 'voice-messages', false)
on conflict (id) do nothing;

-- Mansakha Mail (backend/src/mail/routes/mail.routes.js) - RLS enabled on
-- all 4 tables; every read/write goes through the backend's service_role
-- key, which bypasses RLS same as every other table here, so no policies
-- are added - RBAC/membership checks live in the route handlers themselves.
alter table mail_threads enable row level security;
alter table mail_messages enable row level security;
alter table mail_recipients enable row level security;
alter table mail_attachments enable row level security;

-- NOT public, matching voice-messages - mail can carry case-adjacent
-- sensitive content, so attachment downloads always go through a
-- short-lived signed URL (GET /api/mail/attachments/:attachmentId), never
-- a permanent public link.
insert into storage.buckets (id, name, public)
values ('mail-attachments', 'mail-attachments', false)
on conflict (id) do nothing;

-- Case Details (backend/src/user/routes/user.routes.js) - service_role
-- bypasses RLS same as every other table here; the authorization check
-- (a victim can only ever request their own or a linked docket's court
-- details) lives in the route handler itself.
alter table court_case_details enable row level security;

-- Detailed PDF Reports (migration_025) - service_role bypasses RLS same as
-- every other table here; jurisdiction-scoping for who can see/review a
-- given recipient row lives in the route handlers (requireJurisdiction).
alter table report_recipients enable row level security;
