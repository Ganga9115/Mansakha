-- Mansakha (SIH26094) database schema
-- Postgres, 3NF, for Supabase. Matches SIH26094_Build_Prompt.md Section 6 exactly,
-- plus a `languages` table (Section 4.1 requires the language list to be data).
-- Tables are ordered so every foreign key references a table already created above it.

-- ===== Lookup tables (no FK dependencies) =====

create table jurisdictions (
  jurisdiction_id   uuid primary key default gen_random_uuid(),
  name              text not null,
  level             text not null check (level in ('district', 'state', 'national')),
  parent_id         uuid references jurisdictions(jurisdiction_id)
);

create table roles (
  role_id     uuid primary key default gen_random_uuid(),
  -- 'Data Intake Admin' is a dedicated role (not a scoped Administration
  -- variant) - its permission set (create user credentials, simulated
  -- case fetch) doesn't overlap with District/State/National Administration
  -- at all, so modeling it as its own role keeps RBAC checks unambiguous.
  role_name   text not null unique check (role_name in ('Ministry', 'Administration', 'Counsellor', 'Data Operator'))
);
insert into roles (role_name) values ('Ministry'), ('Administration'), ('Counsellor'), ('Data Operator');

create table case_types (
  case_type_id  uuid primary key default gen_random_uuid(),
  name          text not null unique,
  deleted_at    timestamptz -- soft-delete, matches languages' pattern
);
-- Seed data (not sample/demo data - these are the PS's own named Priority Use Cases):
insert into case_types (name) values
  ('Rape / Gang Rape'),
  ('Murder / Grievous Hurt / Arson'),
  ('Witness Facing Intimidation or Threats'),
  ('Family Affected by Caste-Based Violence');

create table channels (
  channel_id    uuid primary key default gen_random_uuid(),
  channel_name  text not null unique,
  deleted_at    timestamptz -- soft-delete, matches languages' pattern - Ministry
                             -- System Configuration manages this list (routes/ministry.js)
);
insert into channels (channel_name) values
  ('Chatbot'), ('IVRS'), ('SMS'), ('Mobile App'), ('Web Portal'),
  ('NHAA Helpline (14566)'), ('Integrated Portal'), ('Helpline Follow-Up');

create table signal_types (
  signal_type_id  uuid primary key default gen_random_uuid(),
  name            text not null unique
);
insert into signal_types (name) values
  ('sentiment_score'), ('voice_stress_score'), ('emotion_score'), ('engagement_score');

create table risk_levels (
  risk_level_id  uuid primary key default gen_random_uuid(),
  name           text not null unique check (name in ('Low', 'Moderate', 'High', 'Critical')),
  sort_order     int not null unique
);
insert into risk_levels (name, sort_order) values
  ('Low', 1), ('Moderate', 2), ('High', 3), ('Critical', 4);

create table alert_statuses (
  alert_status_id  uuid primary key default gen_random_uuid(),
  name             text not null unique check (name in ('Open', 'Acknowledged', 'Resolved'))
);
insert into alert_statuses (name) values ('Open'), ('Acknowledged'), ('Resolved');

create table intervention_types (
  intervention_type_id  uuid primary key default gen_random_uuid(),
  name                   text not null unique,
  deleted_at              timestamptz -- soft-delete, matches languages' pattern
);
insert into intervention_types (name) values
  ('Counselling'), ('Medical'), ('Witness Protection'), ('Relocation'),
  ('Financial Assistance'), ('Legal Aid'), ('Rehabilitation');

create table languages (
  language_id  uuid primary key default gen_random_uuid(),
  code         text not null unique,
  name         text not null,
  deleted_at   timestamptz -- soft-delete: users.preferred_language FKs into this,
                            -- so a language already picked by a user must keep
                            -- resolving even after Ministry "removes" it from the
                            -- selectable list (see routes/ministry.js DELETE /languages)
);
insert into languages (code, name) values
  ('hi', 'Hindi'), ('en', 'English'), ('bn', 'Bengali'),
  ('mr', 'Marathi'), ('te', 'Telugu'), ('ta', 'Tamil');

-- ===== Officials & role assignments (depend on jurisdictions, roles) =====

create table officials (
  official_id           uuid primary key default gen_random_uuid(),
  full_name             text not null,
  email                 text not null unique,
  phone                 text,
  password_hash         text not null,
  must_change_password  boolean not null default true,
  staff_id              text not null default '1', -- third required login credential
                               -- (alongside email+password), labeled per role in the
                               -- UI ("State Admin ID", "Counsellor ID", etc.) - '1'
                               -- for every account until a real numbering scheme exists
  provisioned_by        uuid references officials(official_id),
  expo_push_token       text, -- set via PATCH /api/me/push-token once the
                               -- frontend registers a device (see
                               -- services/dispatchWorker.js) - null until then
  profile_image_url     text, -- Supabase Storage public URL, set via
                               -- POST /api/me/profile-photo - null until uploaded
  whatsapp_number       text, -- separate from `phone` - a user who opts for
                               -- manual counselling and picks "WhatsApp" gets
                               -- redirected here, not necessarily the same
                               -- number as the official contact line
  created_at            timestamptz not null default now()
);

-- Join table: an official's role + jurisdiction scope is revocable data, not a flat
-- column on `officials` - see Build Prompt Section 0b.
create table official_roles (
  official_role_id  uuid primary key default gen_random_uuid(),
  official_id        uuid not null references officials(official_id),
  role_id             uuid not null references roles(role_id),
  jurisdiction_id      uuid references jurisdictions(jurisdiction_id), -- null for Ministry (unrestricted)
  assigned_by          uuid references officials(official_id),
  assigned_at          timestamptz not null default now(),
  revoked_at           timestamptz
);

-- ===== Users & identity (depend on case_types, jurisdictions) =====

create table users (
  user_id          uuid primary key default gen_random_uuid(),
  docket_number      text unique, -- reused from NHAA/Integrated Portal where available
  case_type_id       uuid not null references case_types(case_type_id),
  jurisdiction_id    uuid not null references jurisdictions(jurisdiction_id),
  -- 'Case Closed' is terminal and settable only by Data Operator
  -- (services/userProvisioning.js enforces this in code - a CHECK
  -- constraint can't see who's calling). Used by the counsellor-assignment
  -- algorithm (services/stressResponse.js) to know a case no longer counts
  -- toward a counsellor's active caseload.
  case_stage         text not null check (case_stage in ('Investigation', 'Trial', 'Rehabilitation', 'Compensation', 'Case Closed')),
  preferred_language uuid references languages(language_id),
  -- Records who provisioned this record - users no longer self-register
  -- (Feature Catalog Section 1.1: login is docket_number + full_name +
  -- contact number + password, a staff-provisioned credential set, not an
  -- OTP-verified signup). The handful of legacy OTP/Google rows predating
  -- this change were removed and this constraint tightened to match.
  auth_method        text not null check (auth_method in ('district_admin', 'data_intake_admin')),
  password_hash      text, -- REACTIVATED: a 4th required login credential alongside
                            -- Docket ID + Full Name + Contact Number, per explicit
                            -- request - every user a District/Data Intake Admin
                            -- creates gets password 'User123' (bcrypt-hashed here),
                            -- with must_change_password below forcing a real one on
                            -- first login. Column predates this and was briefly
                            -- unused between the OTP-login removal and this change.
  must_change_password boolean not null default true, -- mirrors officials.must_change_password
  expo_push_token    text, -- set via PATCH /api/me/push-token once the frontend
                            -- registers a device (see services/dispatchWorker.js) - null until then
  enrolled_at        timestamptz not null default now(),
  status             text not null default 'active' check (status in ('active', 'inactive')),
  -- Workload reporting AND real auto-assignment target (Section 1.5: a
  -- Critical case where the user hasn't opted for manual counsellor
  -- selection gets auto-assigned to whichever eligible counsellor has the
  -- fewest open cases). Does NOT gate case-queue visibility - every
  -- counsellor in a jurisdiction still sees every case in it.
  assigned_counsellor_id uuid references officials(official_id),
  -- Section 1.4: user can request a specific human counsellor rather than
  -- automated-only monitoring - gates in-app messaging + the Call Counsellor
  -- button (routes/user.js) and Critical-case routing (services/stressResponse.js).
  opted_for_manual_counsellor boolean not null default false,
  -- Section 1.3: opt-in for outbound SMS check-in prompts via dispatch_queue.
  sms_checkin_enabled boolean not null default false,
  -- Section 2.2 "List of assigned users with back-stories" - free-text,
  -- entered by whoever provisions the record (District/Data Intake Admin);
  -- shown as a truncated excerpt on the Counsellor case list, full text on
  -- Case Detail. Kept on users (not user_identity) since it's case
  -- context for the scoring/alert pipeline's audience, not raw PII.
  case_background text
);

-- PII kept separate from the scoring/alert pipeline, which only ever touches `users`.
create table user_identity (
  user_id          uuid primary key references users(user_id),
  full_name          text not null,
  contact_number     text,
  email               text,
  address             text,
  id_ref_encrypted    text -- encrypted reference to the NHAA/Integrated Portal case ID
);

create table consent_records (
  consent_id   uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users(user_id),
  channel_id     uuid not null references channels(channel_id),
  granted_at     timestamptz not null default now(),
  revoked_at     timestamptz
);

-- ===== Interactions & AI signals (depend on users, channels, signal_types) =====

create table interactions (
  interaction_id    uuid primary key default gen_random_uuid(),
  user_id          uuid not null references users(user_id),
  channel_id          uuid not null references channels(channel_id),
  occurred_at          timestamptz not null default now(),
  duration_seconds      int,
  transcript_ref        text, -- real Supabase Storage object path (bucket "transcripts",
                                -- at-rest encrypted by Storage itself); the raw check-in
                                -- text is no longer stored directly in this table
  transcript_length      int -- character count of the transcript, kept here (not
                               -- sensitive on its own) so services/ai.js's engagement-
                               -- delta baseline doesn't need a Storage read per prior
                               -- interaction just to measure response length
);

create table interaction_signals (
  signal_id       uuid primary key default gen_random_uuid(),
  interaction_id   uuid not null references interactions(interaction_id),
  signal_type_id    uuid not null references signal_types(signal_type_id),
  value              numeric not null,
  confidence          numeric,
  model_version        text not null
);

create table distress_scores (
  score_id        uuid primary key default gen_random_uuid(),
  user_id        uuid not null references users(user_id),
  interaction_id    uuid not null references interactions(interaction_id),
  score_value        numeric not null check (score_value >= 0 and score_value <= 100),
  risk_level_id       uuid not null references risk_levels(risk_level_id),
  model_version        text not null,
  explanation          text, -- Gemini's natural-language reasoning for this score,
                              -- previously requested/received but discarded (see
                              -- services/ai.js) instead of shown to Counsellors
  suggested_intervention_type_id  uuid references intervention_types(intervention_type_id),
                              -- Gemini's suggestion, reviewed/overridable by a
                              -- Counsellor on Log Intervention - never auto-applied
  computed_at          timestamptz not null default now()
);

-- ===== Alerts & interventions (depend on users, distress_scores, officials) =====

create table alerts (
  alert_id          uuid primary key default gen_random_uuid(),
  user_id          uuid not null references users(user_id),
  distress_score_id   uuid not null references distress_scores(score_id),
  alert_status_id       uuid not null references alert_statuses(alert_status_id),
  triggered_at           timestamptz not null default now(),
  resolved_at             timestamptz
);

-- Feature Catalog Section 1.5 SOS - a user-triggered emergency event.
-- Deliberately its own lightweight table, NOT routed through
-- interactions/distress_scores/alerts (no AI scoring, no fabricated score
-- value) - SOS needs to be fast and not depend on the same chain a real
-- distress-score alert does. resolved_at/resolved_by are set by
-- PATCH /api/counsellor/sos/:sosEventId/resolve.
create table sos_events (
  sos_event_id  uuid primary key default gen_random_uuid(),
  user_id      uuid not null references users(user_id),
  triggered_at    timestamptz not null default now(),
  resolved_at       timestamptz,
  resolved_by         uuid references officials(official_id)
);

-- Per Build Prompt Section 4.4: written for the assigned Counsellor AND every
-- District Administration official in the user's jurisdiction (for a
-- distress-score alert), not just one row. For an SOS event, exactly one row
-- (source: 'sos') targeting the assigned/auto-selected counsellor - see
-- routes/user.js's /sos and the check constraint below.
create table alert_notifications (
  alert_notification_id  uuid primary key default gen_random_uuid(),
  alert_id                 uuid references alerts(alert_id),
  sos_event_id              uuid references sos_events(sos_event_id),
  official_id                uuid not null references officials(official_id),
  notified_at                  timestamptz not null default now(),
  -- Feature Catalog Section 2.2/2.4: lets the Counsellor/Admin UI visually
  -- distinguish a user-initiated SOS from a normal threshold-triggered alert.
  source                       text not null default 'distress_score' check (source in ('distress_score', 'sos')),
  -- Section 1.5: a Critical case already opted for manual counsellor
  -- selection (or any SOS) gets an 'urgent'-priority notification, distinct
  -- from a normal High/Critical alert.
  priority                       text not null default 'normal' check (priority in ('normal', 'urgent')),
  -- True when Section 1.5's auto-assignment picked this recipient (Critical,
  -- not opted for manual counsellor) rather than the alert routing to an
  -- already-assigned counsellor - lets the UI show that context.
  auto_assigned                    boolean not null default false,
  constraint alert_notifications_alert_xor_sos check (
    (alert_id is not null and sos_event_id is null) or (alert_id is null and sos_event_id is not null)
  )
);

create table interventions (
  intervention_id       uuid primary key default gen_random_uuid(),
  user_id               uuid not null references users(user_id),
  alert_id                  uuid references alerts(alert_id),
  intervention_type_id        uuid not null references intervention_types(intervention_type_id),
  assigned_official_id          uuid not null references officials(official_id),
  notes                           text,
  recommended_at                   timestamptz not null default now(),
  completed_at                       timestamptz
);

-- Free-text case notes a Counsellor leaves on a case - separate from
-- interventions (a structured, typed action) and from audit_log (a record of
-- reads/writes, not commentary).
create table case_notes (
  note_id      uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users(user_id),
  official_id    uuid references officials(official_id), -- null for an AI-drafted
                  -- note (Section 2.3: auto-generated right after a check-in, before
                  -- any Counsellor has reviewed/edited it) - not-null for a manual one
  note_text       text not null,
  -- Feature Catalog Section 2.3: an AI-drafted note (auto-summarized after a
  -- check-in) is editable by the Counsellor before it's "final" - it stays a
  -- normal case_notes row either way, this just flags provenance for the UI.
  authored_by       text not null default 'manual' check (authored_by in ('manual', 'ai')),
  created_at           timestamptz not null default now()
);

-- Durable dispatch queue - the "worker/poller dispatch them (SMS/push/
-- in-app), with retry on failure" half of Section 0b's "queue, not a direct
-- call," previously missing (delivery was frontend polling only). One row
-- per (target, notification), drained by services/dispatchWorker.js.
create table dispatch_queue (
  dispatch_id      uuid primary key default gen_random_uuid(),
  -- 'ivrs_call'/'sms_checkin_prompt': Section 1.3. 'wellness_push'/
  -- 'ai_proactive_contact': Section 1.5's Moderate/High automated response.
  -- 'admin_broadcast_sms'/'admin_broadcast_push': Ministry Analytics &
  -- Workflow spec Task 2C (migration_010) - an admin-triggered mass send to
  -- every active user in a jurisdiction, distinct from every other kind
  -- above (which are individual automated triggers, not admin-initiated).
  kind              text not null check (kind in ('checkin_due', 'alert', 'ivrs_call', 'sms_checkin_prompt', 'wellness_push', 'ai_proactive_contact', 'admin_broadcast_sms', 'admin_broadcast_push')),
  user_id          uuid references users(user_id),   -- target for every kind except 'alert'
  official_id         uuid references officials(official_id), -- target for 'alert'
  alert_id             uuid references alerts(alert_id),
  -- migration_010: every OTHER kind derives its delivered text from fixed
  -- hardcoded strings at drain time (services/dispatchWorker.js) - only
  -- admin_broadcast_sms/admin_broadcast_push carry admin-authored freeform
  -- text, which has to survive on the row since drainDispatchQueue may run
  -- up to a minute after the row is inserted. `priority` mirrors
  -- alert_notifications.priority's existing 'normal'/'urgent' convention.
  -- Both null/unused for every other kind.
  message               text,
  priority                text check (priority in ('normal', 'urgent')),
  attempt_count             int not null default 0,
  last_attempt_at            timestamptz,
  delivered_at                 timestamptz,
  created_at                    timestamptz not null default now()
);

-- ===== Audit log (depends on officials, users) =====

create table audit_log (
  log_id        uuid primary key default gen_random_uuid(),
  official_id    uuid references officials(official_id),
  user_id       uuid references users(user_id),
  action           text not null,
  entity_type       text not null,
  entity_id           uuid,
  occurred_at           timestamptz not null default now()
);

-- ===== Feature Catalog additions (depend on users/officials/languages/jurisdictions above) =====

-- Section 1.3 AI Chat - persisted conversation history, distinct from
-- `interactions` (which represents a scored check-in/SOS event, not a chat
-- turn) and from `messages` below (user<->official, not user<->AI).
create table chat_messages (
  message_id  uuid primary key default gen_random_uuid(),
  user_id    uuid not null references users(user_id),
  sender        text not null check (sender in ('user', 'ai')),
  body           text not null,
  sent_at         timestamptz not null default now()
);

-- Section 1.4 in-app chat between a user and their assigned Counsellor -
-- only reachable when users.opted_for_manual_counsellor is true AND
-- users.assigned_counsellor_id is set (enforced in routes/user.js and
-- routes/counsellor.js at query time, not just hidden in the UI).
create table messages (
  message_id  uuid primary key default gen_random_uuid(),
  user_id    uuid not null references users(user_id),
  official_id   uuid not null references officials(official_id),
  sender_type    text not null check (sender_type in ('user', 'official')),
  -- Nullable: a voice message (message_type = 'voice') carries no text body,
  -- just audio_path/duration_seconds instead.
  body            text,
  sent_at          timestamptz not null default now(),
  -- Set when the OTHER party's GET fetches this message - backs the
  -- unread-dot indicator on the "Chat with User"/"My Counsellor" entry
  -- points. Null = unread.
  read_at          timestamptz,
  -- WhatsApp-style voice messages: recorded client-side, uploaded whole,
  -- played back with a duration. audio_path is a path inside the private
  -- `voice-messages` Storage bucket (see security_and_realtime.sql) -
  -- exchanged for a short-lived signed URL on every GET, never stored as a
  -- permanent public link.
  message_type     text not null default 'text' check (message_type in ('text', 'voice')),
  audio_path       text,
  duration_seconds integer
);

-- Ephemeral typing-indicator ping - one row per (user_id, official_id,
-- sender_type), upserted on every ping, polled by the OTHER party alongside
-- messages. No history kept, an old row is just overwritten.
create table typing_status (
  user_id      uuid not null references users(user_id),
  official_id  uuid not null references officials(official_id),
  sender_type  text not null check (sender_type in ('user', 'official')),
  updated_at   timestamptz not null default now(),
  primary key (user_id, official_id, sender_type)
);

-- Section 1.6 Wellness & Self-Care - static content, not AI-generated.
create table wellness_content (
  content_id       uuid primary key default gen_random_uuid(),
  category          text not null check (category in ('exercise', 'meditation', 'music')),
  title              text not null,
  body                jsonb not null, -- exercise/music: {text, url?}; meditation: {steps:[{instruction, durationSeconds}]}
  language_id           uuid references languages(language_id),
  duration_seconds        int, -- meditation only: total session length
  created_at                timestamptz not null default now()
);

-- Section 1.6 Journal writing - reflection-only signal (sentiment_score reuses
-- services/gemini.js's existing sentiment extraction, doesn't duplicate it),
-- deliberately NOT fed into distress_scores/the trend line (see routes/user.js).
-- title/updated_at added by migration_008 (edit/delete support, list ordered
-- by last-edited instead of created_at).
create table journal_entries (
  entry_id      uuid primary key default gen_random_uuid(),
  user_id      uuid not null references users(user_id),
  title          text not null,
  content         text not null,
  language_id       uuid references languages(language_id),
  sentiment_score     numeric,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- Section 2.2 Scheduled counsellings.
create table counselling_sessions (
  session_id    uuid primary key default gen_random_uuid(),
  user_id      uuid not null references users(user_id),
  counsellor_id   uuid not null references officials(official_id),
  scheduled_at      timestamptz not null,
  status              text not null default 'upcoming' check (status in ('upcoming', 'completed', 'cancelled')),
  created_at            timestamptz not null default now()
);

-- Ministry Analytics & Workflow spec - caches Gemini-generated qualitative
-- themes/predictive counsellor demand per jurisdiction (POST
-- /api/admin/analytics/generate), so the Ministry dashboard doesn't call
-- Gemini on every page load against the shared free-tier quota.
create table jurisdiction_analytics_insights (
  insight_id      uuid primary key default gen_random_uuid(),
  jurisdiction_id  uuid not null references jurisdictions(jurisdiction_id),
  generated_at      timestamptz not null default now(),
  period_start        timestamptz not null,
  period_end            timestamptz not null,
  top_themes              jsonb not null, -- [{theme, prevalence}]
  overall_sentiment          text,
  emerging_risks               jsonb, -- string[] - potential organized-intimidation flags
  predicted_counsellor_demand    text check (predicted_counsellor_demand in ('low', 'stable', 'high_surge_expected')),
  demand_reasoning                  text
);

-- Strategic interventions a National/State admin launches, so their effect
-- on the distress trend line can be visually compared (trend chart overlays
-- a marker at launched_at).
create table policies (
  policy_id     uuid primary key default gen_random_uuid(),
  jurisdiction_id  uuid not null references jurisdictions(jurisdiction_id),
  title             text not null,
  description         text,
  launched_at           timestamptz not null,
  created_by              uuid references officials(official_id)
);

-- Sections 3.6/4.4/6.3 - a District/State/National Admin snapshots their
-- current dashboard numbers so Ministry has something concrete to receive
-- ("share upwards"), rather than Ministry re-deriving the same aggregates.
-- status/target_jurisdiction_id/commentary/insight_id (Ministry Analytics &
-- Workflow spec) support real District -> State -> National upward
-- routing: a report is 'Draft' until sent, target_jurisdiction_id is the
-- parent tier it's sent to, commentary is the sending admin's own write-up
-- alongside the optional AI insight snapshot it was generated from.
create table reports (
  report_id       uuid primary key default gen_random_uuid(),
  jurisdiction_id  uuid not null references jurisdictions(jurisdiction_id),
  generated_by      uuid not null references officials(official_id),
  generated_at        timestamptz not null default now(),
  period_start          timestamptz not null,
  period_end              timestamptz not null,
  snapshot                  jsonb not null,
  status                      text not null default 'Draft' check (status in ('Draft', 'Submitted', 'Reviewed')),
  target_jurisdiction_id        uuid references jurisdictions(jurisdiction_id),
  commentary                       text,
  insight_id                         uuid references jurisdiction_analytics_insights(insight_id)
);

-- ===== Indexes for the access patterns the API contract implies =====

create index idx_users_jurisdiction on users(jurisdiction_id);
create index idx_official_roles_official on official_roles(official_id) where revoked_at is null;
create index idx_interactions_user on interactions(user_id);
create index idx_distress_scores_user on distress_scores(user_id, computed_at desc);
create index idx_alerts_status on alerts(alert_status_id);
create index idx_alert_notifications_official on alert_notifications(official_id);
create index idx_sos_events_user on sos_events(user_id, triggered_at desc);
create index idx_audit_log_user on audit_log(user_id);
create index idx_case_notes_user on case_notes(user_id, created_at desc);
create index idx_dispatch_queue_pending on dispatch_queue(created_at) where delivered_at is null;
create index idx_chat_messages_user on chat_messages(user_id, sent_at);
create index idx_messages_user on messages(user_id, sent_at);
create index idx_messages_official on messages(official_id, sent_at);
create index idx_wellness_content_category on wellness_content(category);
create index idx_journal_entries_user on journal_entries(user_id, updated_at desc);
create index idx_counselling_sessions_counsellor on counselling_sessions(counsellor_id, scheduled_at);
create index idx_reports_jurisdiction on reports(jurisdiction_id, generated_at desc);
create index idx_jurisdiction_analytics_insights_jurisdiction on jurisdiction_analytics_insights(jurisdiction_id, generated_at desc);
create index idx_policies_jurisdiction on policies(jurisdiction_id, launched_at desc);
create index idx_reports_target_jurisdiction on reports(target_jurisdiction_id, generated_at desc);
-- migration_011_ollama_and_policies.sql
-- Description: Adds tables for the Ollama 15-question dynamic Check-In flow and Ministry Policy deployment.

BEGIN;

-- 1. Table for Ollama Dynamic Questionnaires
CREATE TABLE IF NOT EXISTS user_questionnaires (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(user_id) ON DELETE CASCADE,
    responses JSONB NOT NULL DEFAULT '[]'::jsonb, -- Stores the Q&A pairs
    predicted_distress_score INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS for user_questionnaires
ALTER TABLE user_questionnaires ENABLE ROW LEVEL SECURITY;

-- Users can insert their own questionnaires
CREATE POLICY "Users can insert their own questionnaires"
    ON user_questionnaires
    FOR INSERT
    WITH CHECK (user_id = (current_setting('request.jwt.claims', true)::json->>'sub')::uuid);

-- Users can read their own questionnaires
CREATE POLICY "Users can read their own questionnaires"
    ON user_questionnaires
    FOR SELECT
    USING (user_id = (current_setting('request.jwt.claims', true)::json->>'sub')::uuid);

-- Staff/Ministry can read all questionnaires (assuming privacy isn't restricted here per user prompt)
CREATE POLICY "Staff can read all questionnaires"
    ON user_questionnaires
    FOR SELECT
    USING (
        (current_setting('request.jwt.claims', true)::json->>'account_type') IN ('Counsellor', 'Administration', 'Ministry')
    );

-- 2. Table for Ministry Policies
-- Policies are strategic interventions deployed by National/State admins to measure impact over time.
-- Note: Re-creating this safely just in case migration_009_ministry_analytics didn't create it exactly as needed, 
-- or ensuring it exists if it wasn't there.
CREATE TABLE IF NOT EXISTS policies (
    policy_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    jurisdiction_id UUID REFERENCES jurisdictions(jurisdiction_id) ON DELETE CASCADE NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    launched_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_by UUID REFERENCES officials(official_id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS for policies
ALTER TABLE policies ENABLE ROW LEVEL SECURITY;

-- Admins/Ministry can insert and read policies
CREATE POLICY "Admins can manage policies"
    ON policies
    FOR ALL
    USING (
        (current_setting('request.jwt.claims', true)::json->>'account_type') IN ('Administration', 'Ministry')
    );

-- Staff can read policies
CREATE POLICY "Staff can read policies"
    ON policies
    FOR SELECT
    USING (
        (current_setting('request.jwt.claims', true)::json->>'account_type') IN ('Counsellor', 'Administration', 'Ministry')
    );

COMMIT;

