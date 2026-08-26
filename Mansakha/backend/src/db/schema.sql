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
  -- variant) - its permission set (create victim credentials, simulated
  -- case fetch) doesn't overlap with District/State/National Administration
  -- at all, so modeling it as its own role keeps RBAC checks unambiguous.
  role_name   text not null unique check (role_name in ('Ministry', 'Administration', 'Counsellor', 'Data Intake Admin'))
);
insert into roles (role_name) values ('Ministry'), ('Administration'), ('Counsellor'), ('Data Intake Admin');

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
  deleted_at   timestamptz -- soft-delete: victims.preferred_language FKs into this,
                            -- so a language already picked by a victim must keep
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
  provisioned_by        uuid references officials(official_id),
  expo_push_token       text, -- set via PATCH /api/me/push-token once the
                               -- frontend registers a device (see
                               -- services/dispatchWorker.js) - null until then
  profile_image_url     text, -- Supabase Storage public URL, set via
                               -- POST /api/me/profile-photo - null until uploaded
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

-- ===== Victims & identity (depend on case_types, jurisdictions) =====

create table victims (
  victim_id          uuid primary key default gen_random_uuid(),
  docket_number      text unique, -- reused from NHAA/Integrated Portal where available
  case_type_id       uuid not null references case_types(case_type_id),
  jurisdiction_id    uuid not null references jurisdictions(jurisdiction_id),
  case_stage         text not null check (case_stage in ('Investigation', 'Trial', 'Rehabilitation', 'Compensation')),
  preferred_language uuid references languages(language_id),
  -- Records who provisioned this record - victims no longer self-register
  -- (Feature Catalog Section 1.1: login is docket_number + full_name + state +
  -- district, a credential-less lookup, not an OTP-verified signup). Old
  -- OTP/Google values kept in the allow-list for backward compatibility with
  -- rows created before this change; new rows only ever use the two staff-
  -- provisioning values.
  auth_method        text not null check (auth_method in ('mobile_otp', 'email_otp', 'google', 'district_admin', 'data_intake_admin')),
  password_hash      text, -- LEGACY, unused by any current route - the OTP/password
                            -- login model this backed was replaced by docket-based
                            -- login (Section 1.1). Left in place rather than dropped
                            -- (no live code writes or reads it); safe to drop in a
                            -- later cleanup pass once confirmed nothing depends on it.
  expo_push_token    text, -- set via PATCH /api/me/push-token once the frontend
                            -- registers a device (see services/dispatchWorker.js) - null until then
  enrolled_at        timestamptz not null default now(),
  status             text not null default 'active' check (status in ('active', 'inactive')),
  -- Workload reporting AND real auto-assignment target (Section 1.5: a
  -- Critical case where the victim hasn't opted for manual counsellor
  -- selection gets auto-assigned to whichever eligible counsellor has the
  -- fewest open cases). Does NOT gate case-queue visibility - every
  -- counsellor in a jurisdiction still sees every case in it.
  assigned_counsellor_id uuid references officials(official_id),
  -- Section 1.4: victim can request a specific human counsellor rather than
  -- automated-only monitoring - gates in-app messaging + the Call Counsellor
  -- button (routes/victim.js) and Critical-case routing (services/stressResponse.js).
  opted_for_manual_counsellor boolean not null default false,
  -- Section 1.3: opt-in for outbound SMS check-in prompts via dispatch_queue.
  sms_checkin_enabled boolean not null default false,
  -- Section 2.2 "List of assigned victims with back-stories" - free-text,
  -- entered by whoever provisions the record (District/Data Intake Admin);
  -- shown as a truncated excerpt on the Counsellor case list, full text on
  -- Case Detail. Kept on victims (not victim_identity) since it's case
  -- context for the scoring/alert pipeline's audience, not raw PII.
  case_background text
);

-- PII kept separate from the scoring/alert pipeline, which only ever touches `victims`.
create table victim_identity (
  victim_id          uuid primary key references victims(victim_id),
  full_name          text not null,
  contact_number     text,
  email               text,
  address             text,
  id_ref_encrypted    text -- encrypted reference to the NHAA/Integrated Portal case ID
);

create table consent_records (
  consent_id   uuid primary key default gen_random_uuid(),
  victim_id     uuid not null references victims(victim_id),
  channel_id     uuid not null references channels(channel_id),
  granted_at     timestamptz not null default now(),
  revoked_at     timestamptz
);

-- ===== Interactions & AI signals (depend on victims, channels, signal_types) =====

create table interactions (
  interaction_id    uuid primary key default gen_random_uuid(),
  victim_id          uuid not null references victims(victim_id),
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
  victim_id        uuid not null references victims(victim_id),
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

-- ===== Alerts & interventions (depend on victims, distress_scores, officials) =====

create table alerts (
  alert_id          uuid primary key default gen_random_uuid(),
  victim_id          uuid not null references victims(victim_id),
  distress_score_id   uuid not null references distress_scores(score_id),
  alert_status_id       uuid not null references alert_statuses(alert_status_id),
  triggered_at           timestamptz not null default now(),
  resolved_at             timestamptz
);

-- Feature Catalog Section 1.5 SOS - a victim-triggered emergency event.
-- Deliberately its own lightweight table, NOT routed through
-- interactions/distress_scores/alerts (no AI scoring, no fabricated score
-- value) - SOS needs to be fast and not depend on the same chain a real
-- distress-score alert does. resolved_at/resolved_by are set by
-- PATCH /api/counsellor/sos/:sosEventId/resolve.
create table sos_events (
  sos_event_id  uuid primary key default gen_random_uuid(),
  victim_id      uuid not null references victims(victim_id),
  triggered_at    timestamptz not null default now(),
  resolved_at       timestamptz,
  resolved_by         uuid references officials(official_id)
);

-- Per Build Prompt Section 4.4: written for the assigned Counsellor AND every
-- District Administration official in the victim's jurisdiction (for a
-- distress-score alert), not just one row. For an SOS event, exactly one row
-- (source: 'sos') targeting the assigned/auto-selected counsellor - see
-- routes/victim.js's /sos and the check constraint below.
create table alert_notifications (
  alert_notification_id  uuid primary key default gen_random_uuid(),
  alert_id                 uuid references alerts(alert_id),
  sos_event_id              uuid references sos_events(sos_event_id),
  official_id                uuid not null references officials(official_id),
  notified_at                  timestamptz not null default now(),
  -- Feature Catalog Section 2.2/2.4: lets the Counsellor/Admin UI visually
  -- distinguish a victim-initiated SOS from a normal threshold-triggered alert.
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
  victim_id               uuid not null references victims(victim_id),
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
  victim_id     uuid not null references victims(victim_id),
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
  kind              text not null check (kind in ('checkin_due', 'alert', 'ivrs_call', 'sms_checkin_prompt', 'wellness_push', 'ai_proactive_contact')),
  victim_id          uuid references victims(victim_id),   -- target for every kind except 'alert'
  official_id         uuid references officials(official_id), -- target for 'alert'
  alert_id             uuid references alerts(alert_id),
  attempt_count         int not null default 0,
  last_attempt_at        timestamptz,
  delivered_at             timestamptz,
  created_at                timestamptz not null default now()
);

-- ===== Audit log (depends on officials, victims) =====

create table audit_log (
  log_id        uuid primary key default gen_random_uuid(),
  official_id    uuid references officials(official_id),
  victim_id       uuid references victims(victim_id),
  action           text not null,
  entity_type       text not null,
  entity_id           uuid,
  occurred_at           timestamptz not null default now()
);

-- ===== Feature Catalog additions (depend on victims/officials/languages/jurisdictions above) =====

-- Section 1.3 AI Chat - persisted conversation history, distinct from
-- `interactions` (which represents a scored check-in/SOS event, not a chat
-- turn) and from `messages` below (victim<->official, not victim<->AI).
create table chat_messages (
  message_id  uuid primary key default gen_random_uuid(),
  victim_id    uuid not null references victims(victim_id),
  sender        text not null check (sender in ('victim', 'ai')),
  body           text not null,
  sent_at         timestamptz not null default now()
);

-- Section 1.4 in-app chat between a victim and their assigned Counsellor -
-- only reachable when victims.opted_for_manual_counsellor is true AND
-- victims.assigned_counsellor_id is set (enforced in routes/victim.js and
-- routes/counsellor.js at query time, not just hidden in the UI).
create table messages (
  message_id  uuid primary key default gen_random_uuid(),
  victim_id    uuid not null references victims(victim_id),
  official_id   uuid not null references officials(official_id),
  sender_type    text not null check (sender_type in ('victim', 'official')),
  body            text not null,
  sent_at          timestamptz not null default now()
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
-- deliberately NOT fed into distress_scores/the trend line (see routes/victim.js).
create table journal_entries (
  entry_id      uuid primary key default gen_random_uuid(),
  victim_id      uuid not null references victims(victim_id),
  content         text not null,
  language_id       uuid references languages(language_id),
  sentiment_score     numeric,
  created_at            timestamptz not null default now()
);

-- Section 2.2 Scheduled counsellings.
create table counselling_sessions (
  session_id    uuid primary key default gen_random_uuid(),
  victim_id      uuid not null references victims(victim_id),
  counsellor_id   uuid not null references officials(official_id),
  scheduled_at      timestamptz not null,
  status              text not null default 'upcoming' check (status in ('upcoming', 'completed', 'cancelled')),
  created_at            timestamptz not null default now()
);

-- Sections 3.6/4.4/6.3 - a District/State/National Admin snapshots their
-- current dashboard numbers so Ministry has something concrete to receive
-- ("share upwards"), rather than Ministry re-deriving the same aggregates.
create table reports (
  report_id       uuid primary key default gen_random_uuid(),
  jurisdiction_id  uuid not null references jurisdictions(jurisdiction_id),
  generated_by      uuid not null references officials(official_id),
  generated_at        timestamptz not null default now(),
  period_start          timestamptz not null,
  period_end              timestamptz not null,
  snapshot                  jsonb not null
);

-- ===== Indexes for the access patterns the API contract implies =====

create index idx_victims_jurisdiction on victims(jurisdiction_id);
create index idx_official_roles_official on official_roles(official_id) where revoked_at is null;
create index idx_interactions_victim on interactions(victim_id);
create index idx_distress_scores_victim on distress_scores(victim_id, computed_at desc);
create index idx_alerts_status on alerts(alert_status_id);
create index idx_alert_notifications_official on alert_notifications(official_id);
create index idx_sos_events_victim on sos_events(victim_id, triggered_at desc);
create index idx_audit_log_victim on audit_log(victim_id);
create index idx_case_notes_victim on case_notes(victim_id, created_at desc);
create index idx_dispatch_queue_pending on dispatch_queue(created_at) where delivered_at is null;
create index idx_chat_messages_victim on chat_messages(victim_id, sent_at);
create index idx_messages_victim on messages(victim_id, sent_at);
create index idx_messages_official on messages(official_id, sent_at);
create index idx_wellness_content_category on wellness_content(category);
create index idx_journal_entries_victim on journal_entries(victim_id, created_at desc);
create index idx_counselling_sessions_counsellor on counselling_sessions(counsellor_id, scheduled_at);
create index idx_reports_jurisdiction on reports(jurisdiction_id, generated_at desc);
