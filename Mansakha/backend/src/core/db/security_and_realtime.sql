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
