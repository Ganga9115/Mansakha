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
  role_name   text not null unique check (role_name in ('Ministry', 'Administration', 'Counsellor'))
);
insert into roles (role_name) values ('Ministry'), ('Administration'), ('Counsellor');

create table case_types (
  case_type_id  uuid primary key default gen_random_uuid(),
  name          text not null unique
);
-- Seed data (not sample/demo data - these are the PS's own named Priority Use Cases):
insert into case_types (name) values
  ('Rape / Gang Rape'),
  ('Murder / Grievous Hurt / Arson'),
  ('Witness Facing Intimidation or Threats'),
  ('Family Affected by Caste-Based Violence');

create table channels (
  channel_id    uuid primary key default gen_random_uuid(),
  channel_name  text not null unique
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
  name                   text not null unique
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
  auth_method        text not null check (auth_method in ('mobile_otp', 'email_otp', 'google')), -- records how they FIRST registered; does not gate later login options
  password_hash      text, -- optional: null unless the victim set a password at registration - OTP/Google always remain available regardless
  expo_push_token    text, -- set via PATCH /api/me/push-token once the frontend
                            -- registers a device (see services/dispatchWorker.js) - null until then
  enrolled_at        timestamptz not null default now(),
  status             text not null default 'active' check (status in ('active', 'inactive')),
  -- Workload reporting only - does NOT gate case-queue visibility. Every
  -- counsellor in a jurisdiction still sees every case in it (unchanged);
  -- this just records who's primarily responsible for a case so workload
  -- can be compared per counsellor, separate from jurisdiction-wide access.
  assigned_counsellor_id uuid references officials(official_id)
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

-- Email OTP codes for victim login/signup, sent via SMTP (services/mailer.js) -
-- replaces Supabase Auth's built-in email OTP. One active code per email: a new
-- /otp/request upserts this row rather than accumulating history, since a code is
-- irrelevant once expired, used, or superseded by a newer request. Backend-only
-- (service_role key), never queried by the frontend directly - see
-- security_and_realtime.sql for the matching deny-all RLS.
create table email_otp_codes (
  email       text primary key,
  code_hash   text not null,
  expires_at  timestamptz not null,
  attempts    smallint not null default 0,
  created_at  timestamptz not null default now()
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

-- Per Build Prompt Section 4.4: written for the assigned Counsellor AND every
-- District Administration official in the victim's jurisdiction, not just one row.
create table alert_notifications (
  alert_notification_id  uuid primary key default gen_random_uuid(),
  alert_id                 uuid not null references alerts(alert_id),
  official_id               uuid not null references officials(official_id),
  notified_at                 timestamptz not null default now()
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
  official_id    uuid not null references officials(official_id),
  note_text       text not null,
  created_at        timestamptz not null default now()
);

-- Durable dispatch queue - the "worker/poller dispatch them (SMS/push/
-- in-app), with retry on failure" half of Section 0b's "queue, not a direct
-- call," previously missing (delivery was frontend polling only). One row
-- per (target, notification), drained by services/dispatchWorker.js.
create table dispatch_queue (
  dispatch_id      uuid primary key default gen_random_uuid(),
  kind              text not null check (kind in ('checkin_due', 'alert')),
  victim_id          uuid references victims(victim_id),   -- target for 'checkin_due'
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

-- ===== Indexes for the access patterns the API contract implies =====

create index idx_victims_jurisdiction on victims(jurisdiction_id);
create index idx_official_roles_official on official_roles(official_id) where revoked_at is null;
create index idx_interactions_victim on interactions(victim_id);
create index idx_distress_scores_victim on distress_scores(victim_id, computed_at desc);
create index idx_alerts_status on alerts(alert_status_id);
create index idx_alert_notifications_official on alert_notifications(official_id);
create index idx_audit_log_victim on audit_log(victim_id);
create index idx_case_notes_victim on case_notes(victim_id, created_at desc);
create index idx_dispatch_queue_pending on dispatch_queue(created_at) where delivered_at is null;
