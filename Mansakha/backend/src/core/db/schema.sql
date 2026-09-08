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
  role_name   text not null unique check (role_name in ('Ministry', 'Administration', 'Counsellor', 'Data Operator',
    'District Welfare Officer', 'Investigating Officer', 'Protection Officer',
    'DLSA Coordinator', 'Special Public Prosecutor', 'District Collector', 'Rehabilitation Officer'))
);
insert into roles (role_name) values ('Ministry'), ('Administration'), ('Counsellor'), ('Data Operator'),
  ('District Welfare Officer'), ('Investigating Officer'), ('Protection Officer'),
  ('DLSA Coordinator'), ('Special Public Prosecutor'), ('District Collector'), ('Rehabilitation Officer');

create table case_types (
  case_type_id  uuid primary key default gen_random_uuid(),
  name          text not null unique,
  deleted_at    timestamptz -- soft-delete, matches languages' pattern
);
-- Seed data (not sample/demo data - these are the PS's own named Priority Use
-- Cases: Rape/Gang Rape, Murder/Grievous Hurt/Arson, Witness Facing
-- Intimidation or Threats, Family Affected by Caste-Based Violence) - split
-- into individually selectable types rather than kept as combined labels, so
-- a case can be categorized precisely instead of forced into one of 4 broad
-- buckets.
insert into case_types (name) values
  ('Rape'),
  ('Gang Rape'),
  ('Murder'),
  ('Grievous Hurt'),
  ('Arson'),
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
  deleted_at              timestamptz, -- soft-delete, matches languages' pattern
  -- Victim-Initiated Intervention Requests (migration_027) - per-type
  -- required-document list driving the request form, kept data-driven since
  -- Ministry already has full CRUD on this table via System Configuration.
  -- Counselling stays '[]' - deliberately excluded from that flow (no
  -- real-world proof/eligibility gate; the app already has a simpler
  -- self-service path via users.opted_for_manual_counsellor).
  required_documents    jsonb not null default '[]'::jsonb
);
insert into intervention_types (name, required_documents) values
  ('Counselling', '[]'::jsonb),
  ('Medical', '[{"label":"Medical Certificate / Diagnosis Report","required":true},{"label":"Hospital Bill or Treatment Estimate","required":false}]'::jsonb),
  ('Witness Protection', '[{"label":"FIR Copy / Case Reference","required":true},{"label":"Police Threat Assessment","required":false}]'::jsonb),
  ('Relocation', '[{"label":"FIR Copy / Case Reference","required":true},{"label":"Police Threat Assessment or Recommendation","required":false},{"label":"Proof of Current Address","required":true}]'::jsonb),
  ('Financial Assistance', '[{"label":"FIR Copy","required":true},{"label":"Caste Certificate (SC/ST Proof)","required":true},{"label":"Bank Passbook / Account Proof","required":true}]'::jsonb),
  ('Legal Aid', '[{"label":"Caste Certificate (SC/ST Proof)","required":true},{"label":"FIR Copy / Case Reference","required":true},{"label":"Aadhaar or Photo ID","required":true}]'::jsonb),
  ('Rehabilitation', '[{"label":"Caste Certificate (SC/ST Proof)","required":true},{"label":"Case Status Document (Chargesheet/Disposal)","required":false},{"label":"Bank Passbook / Account Proof","required":true}]'::jsonb);

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

-- migration_033: real Police Stations, more granular than the district-
-- level jurisdictions above - a real Investigating Officer is scoped to
-- the station where the FIR was filed, not the whole district.
create table police_stations (
  station_id      uuid primary key default gen_random_uuid(),
  name            text not null,
  jurisdiction_id uuid not null references jurisdictions(jurisdiction_id), -- district-level
  deleted_at      timestamptz -- soft-delete, matches languages/case_types' own pattern
);

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
  last_active_at        timestamptz, -- sliding 8-hour inactivity window,
                               -- updated on every authenticated request
                               -- (verifyToken.js) - staff/admin/ministry
                               -- accounts log out after 8h of no activity;
                               -- victim/user accounts have no such column
                               -- or check at all (never auto-logout)
  password_changed_at   timestamptz, -- set whenever password_hash changes
                               -- (self-service /change-password and
                               -- Ministry's PATCH /staff/:officialId reset) -
                               -- verifyToken.js rejects any token issued
                               -- (its `iat`) before this timestamp, so a
                               -- password reset actually invalidates a
                               -- session already in someone else's hands
                               -- instead of leaving it valid indefinitely
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
  revoked_at           timestamptz,
  provider_id          uuid references rehabilitation_providers(provider_id), -- migration_031: which centre a Rehabilitation Officer works for (mirrors jurisdiction_id's own pattern - scope lives on the role grant, not the account)
  station_id           uuid references police_stations(station_id) -- migration_033: which police station an Investigating Officer works at (same pattern again)
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
  auth_method        text not null check (auth_method in ('district_admin', 'data_operator')),
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
  -- Running total of words in this user's AI-chat messages since the last
  -- automatic distress score fired - reset to 0 each time it crosses 5,000
  -- (see POST /api/user/chat/log). Deliberately not a separate "daily
  -- score" table - each threshold-crossing just inserts one more
  -- distress_scores row, so every existing dashboard/trend query that
  -- already reads "latest"/"average over N days" from that table picks
  -- these up with no other change needed.
  chat_word_count    integer not null default 0,
  -- Same pattern, for the 15-question daily check-in: counts total answers
  -- across questionnaire submissions, reset to 0 once it crosses 105
  -- (15 questions x 7 days) and a weekly-scoped score fires (see
  -- POST /api/user/questionnaire/submit).
  questionnaire_answer_count integer not null default 0,
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
  case_background text,
  -- Case Details (victim app) - eCourts' 16-char case identifier, one per
  -- docket (like docket_number itself), NOT resolved through
  -- linked_to_user_id - a CNR belongs to one specific case file, not a
  -- person's whole activity history. Currently simulated (see
  -- core/services/courtCaseSimulation.js) - written by the backend itself
  -- the first time court details are fetched, never entered by the victim.
  cnr_number text unique,
  -- migration_033: which police station's Investigating Officer(s) this
  -- case is assigned to (the station where the FIR was filed) - set at
  -- intake, changeable later ("case transfer" is modeled as changing this).
  station_id uuid references police_stations(station_id)
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
  -- A "seen it, on it" middle state (PATCH .../sos/:sosEventId/acknowledge)
  -- distinct from fully resolved - without it, an urgent-help alert could
  -- only ever be Open or Resolved with no way to signal active work on it.
  acknowledged_at   timestamptz,
  acknowledged_by     uuid references officials(official_id),
  resolved_at       timestamptz,
  resolved_by         uuid references officials(official_id),
  location           jsonb -- migration_032: best-effort {lat,lng,capturedAt} captured when "Get Help Now" is tapped
);

-- migration_033: Investigating Officer's own structured, victim-safe
-- case-progress record - one per case (every registered case gets
-- investigated, so this isn't a referral-triggered escalation like
-- agency_referrals - closer to how every case gets an assigned
-- counsellor). Deliberately separate from users.case_stage (the shared
-- case-lifecycle driver every role's own stage-gating already reads from)
-- - this is IO's own richer internal detail, a curated subset of which
-- (investigation_progress, chargesheet_status) is shown to the victim,
-- explicitly excluding raw evidence (that stays in case_notes, IO-
-- authored, the same table Counsellors already use for their own notes).
create table investigation_records (
  investigation_id          uuid primary key default gen_random_uuid(),
  user_id                   uuid not null unique references users(user_id),
  -- The real signal Threat Tier is computed from
  -- (core/services/threatAssessment.js's ACCUSED_STATUSES) - moved back
  -- here from Protection Officer's own referral metadata, since IO is once
  -- again the role actually tracking custody/bail/absconding status.
  accused_status            text,
  investigation_progress    text,
  chargesheet_status        text not null default 'Not Filed' check (chargesheet_status in ('Not Filed', 'Filed')),
  chargesheet_filed_at      timestamptz,
  threat_alerted_at         timestamptz, -- when IO alerted Protection Officer (the "threat detected" branch)
  investigation_complete_at timestamptz,
  updated_by                uuid references officials(official_id),
  updated_at                timestamptz not null default now(),
  created_at                timestamptz not null default now()
);
create index idx_investigation_records_user on investigation_records(user_id);

-- Per Build Prompt Section 4.4: written for the assigned Counsellor AND every
-- District Administration official in the user's jurisdiction (for a
-- distress-score alert), not just one row. An SOS event fans out the same
-- way, plus every State Administration official over that district's parent
-- state - one row per recipient (source: 'sos') - see
-- user/routes/user.routes.js's /urgent-help and the check constraint below.
create table alert_notifications (
  alert_notification_id  uuid primary key default gen_random_uuid(),
  alert_id                 uuid references alerts(alert_id),
  sos_event_id              uuid references sos_events(sos_event_id),
  -- Set for source = 'disengagement' or 'weekly_review' - neither has an
  -- alerts/sos_events row to hang off of (a 7+-day-inactive notice, or a
  -- periodic-review completion notice), just the user directly.
  user_id                    uuid references users(user_id),
  official_id                uuid not null references officials(official_id),
  notified_at                  timestamptz not null default now(),
  -- Feature Catalog Section 2.2/2.4: lets the Counsellor/Admin UI visually
  -- distinguish a user-initiated SOS from a normal threshold-triggered alert,
  -- plus a disengagement notice (7+ days inactive - see dispatchWorker.js's
  -- scanCheckinsDue).
  source                       text not null default 'distress_score' check (source in ('distress_score', 'sos', 'disengagement', 'weekly_review')),
  -- Section 1.5: a Critical case already opted for manual counsellor
  -- selection (or any SOS) gets an 'urgent'-priority notification, distinct
  -- from a normal High/Critical alert.
  priority                       text not null default 'normal' check (priority in ('normal', 'urgent')),
  -- True when Section 1.5's auto-assignment picked this recipient (Critical,
  -- not opted for manual counsellor) rather than the alert routing to an
  -- already-assigned counsellor - lets the UI show that context.
  auto_assigned                    boolean not null default false,
  constraint alert_notifications_exactly_one_subject check (
    (alert_id is not null and sos_event_id is null and user_id is null) or
    (alert_id is null and sos_event_id is not null and user_id is null) or
    (alert_id is null and sos_event_id is null and user_id is not null)
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

-- Victim-Initiated Intervention Requests (migration_027) - see that
-- migration's own comment for the full reasoning. A victim requests one of
-- the 6 eligible types (Counselling excluded) with proof documents; their
-- District Admin Accepts (inserting a real row into `interventions` above,
-- assigned_official_id = the accepting admin) or Rejects (with a reason).
-- Per literal case (`user_id`), not resolved via linked_to_user_id - same
-- convention as case_notes/interventions themselves.
create table intervention_requests (
  request_id                uuid primary key default gen_random_uuid(),
  user_id                   uuid not null references users(user_id),
  intervention_type_id      uuid not null references intervention_types(intervention_type_id),
  description               text,
  status                    text not null default 'Pending' check (status in ('Pending', 'Accepted', 'Rejected')),
  reviewed_by               uuid references officials(official_id),
  reviewed_at               timestamptz,
  decision_reason           text,
  resulting_intervention_id uuid references interventions(intervention_id),
  requested_at              timestamptz not null default now()
);

-- One row per uploaded proof document - document_label matches one of the
-- request's own intervention_type's required_documents labels.
create table intervention_request_documents (
  document_id    uuid primary key default gen_random_uuid(),
  request_id     uuid not null references intervention_requests(request_id),
  document_label text not null,
  storage_path   text not null,
  content_type   text,
  uploaded_at    timestamptz not null default now()
);

-- Six new coordination roles (District Welfare Officer, Investigating
-- Officer, Protection Officer, DLSA Coordinator, Special Public Prosecutor,
-- District Collector) work this referral layer, independent of
-- intervention_requests/interventions/alerts/distress_scores - District Admin
-- remains the sole Accept/Reject authority on every Intervention Request,
-- unchanged; a referral is something District Admin optionally creates AFTER
-- already deciding a case, purely for cross-agency awareness/follow-up.
create table agency_referrals (
  referral_id              uuid primary key default gen_random_uuid(),
  user_id                  uuid not null references users(user_id),
  referred_to_role         text not null check (referred_to_role in ('District Welfare Officer',
    'Investigating Officer', 'Protection Officer', 'DLSA Coordinator', 'Special Public Prosecutor', 'District Collector', 'Rehabilitation Officer')),
  -- Usually an official's action, but a Rehabilitation Officer referral can
  -- also be the victim's own opt-in (migration_029) - exactly one of these
  -- two is set depending on who created it.
  referred_by_official_id  uuid references officials(official_id),
  referred_by_user_id      uuid references users(user_id),
  reason                   text,
  status                   text not null default 'Open' check (status in ('Open', 'Resolved')),
  metadata                 jsonb not null default '{}'::jsonb, -- role-specific structured fields (assigned lawyer, SLA deadline, trial outcome, rehabilitation providerId/providerName) - same data-driven pattern as intervention_types.required_documents
  created_at               timestamptz not null default now(),
  resolved_at              timestamptz
);

-- Real rehabilitation providers a victim can opt into once their case
-- reaches 'Case Closed' - Government or NGO, Ministry-manageable
-- (migration_029_rehabilitation_opt_in.sql).
create table rehabilitation_providers (
  provider_id     uuid primary key default gen_random_uuid(),
  name            text not null,
  provider_type   text not null check (provider_type in ('Government', 'NGO')),
  jurisdiction_id uuid references jurisdictions(jurisdiction_id),
  contact_info    text,
  deleted_at      timestamptz
);
insert into rehabilitation_providers (name, provider_type, contact_info) values
  ('District Social Welfare Department - Rehabilitation Cell', 'Government', 'Contact your District Welfare Officer for local details.'),
  ('State SC/ST Welfare Department', 'Government', 'Contact your District Welfare Officer for local details.'),
  ('NGO Partner (pending Ministry onboarding)', 'NGO', 'No NGO partners are configured yet - Ministry can add real, vetted partners via System Configuration.');

-- Structured, trackable directives/tasks across all 7 coordination roles -
-- a real action item (specific role, specific action, due date,
-- Pending/Completed status) rather than a free-text note. Any of the 7
-- roles or District Admin can create one targeting any role for a case.
create table agency_tasks (
  task_id                 uuid primary key default gen_random_uuid(),
  user_id                 uuid not null references users(user_id),
  source_referral_id      uuid references agency_referrals(referral_id),
  assigned_to_role        text not null check (assigned_to_role in ('District Welfare Officer',
    'Investigating Officer', 'Protection Officer', 'DLSA Coordinator', 'Special Public Prosecutor', 'District Collector', 'Rehabilitation Officer')),
  created_by_official_id  uuid references officials(official_id),
  action                  text not null,
  due_at                  timestamptz,
  status                  text not null default 'Pending' check (status in ('Pending', 'Completed')),
  completed_at            timestamptz,
  auto_generated          boolean not null default false,
  created_at              timestamptz not null default now()
);

-- Generic timestamped log - covers IO's status updates, Protection Officer's
-- weekly verification, DWO/DLSA/SPP's working notes, and DM's directives with
-- one shape, same "parent row + notes" pattern as case_notes below.
create table agency_referral_notes (
  note_id             uuid primary key default gen_random_uuid(),
  referral_id         uuid not null references agency_referrals(referral_id),
  author_official_id  uuid not null references officials(official_id),
  note_text           text not null,
  created_at          timestamptz not null default now()
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
  target_jurisdiction_id        uuid references jurisdictions(jurisdiction_id), -- superseded by report_recipients below (migration_025); kept for old rows
  commentary                       text,
  insight_id                         uuid references jurisdiction_analytics_insights(insight_id),
  -- Detailed PDF Reports (migration_025) - which calendar-period resolver
  -- (services/reportPeriods.js) produced period_start/period_end. Every
  -- pre-migration row is backfilled to 'custom', since that's exactly what
  -- an arbitrary start/end range is.
  period_type                       text check (period_type in ('weekly', 'monthly', 'quarterly', 'custom'))
);

-- Detailed PDF Reports (migration_025) - multi-recipient routing. See that
-- migration's own comment for the full reasoning: a report can be sent to
-- more than one office at once (a District's report to its own State AND,
-- optionally, National and/or Ministry directly), each reviewing
-- independently. recipient_type/jurisdiction_id together handle Ministry not
-- being a real jurisdictions row - a Ministry recipient has
-- recipient_type='ministry' and a null jurisdiction_id.
create table report_recipients (
  recipient_id     uuid primary key default gen_random_uuid(),
  report_id        uuid not null references reports(report_id),
  recipient_type   text not null check (recipient_type in ('jurisdiction', 'ministry')),
  jurisdiction_id  uuid references jurisdictions(jurisdiction_id),
  is_primary       boolean not null default false,
  status           text not null default 'Submitted' check (status in ('Submitted', 'Reviewed')),
  reviewed_by      uuid references officials(official_id),
  reviewed_at      timestamptz,
  -- "Forward after review" (migration_026) - both null for a recipient row
  -- created at ORIGINAL generation time (the primary/optional-cc rows POST
  -- .../reports/generate inserts); both set for a row created via
  -- POST .../reports/:reportId/forward, so the PDF trail and plain
  -- GET /reports list responses can tell an original recipient apart from a
  -- forwarded one.
  forwarded_by     uuid references officials(official_id),
  forwarded_at     timestamptz,
  unique (report_id, recipient_type, jurisdiction_id)
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
-- migration_025_report_recipients.sql
create index idx_report_recipients_report on report_recipients(report_id);
create index idx_report_recipients_jurisdiction on report_recipients(jurisdiction_id) where recipient_type = 'jurisdiction';
create unique index idx_report_recipients_one_ministry on report_recipients(report_id) where recipient_type = 'ministry';
-- migration_027_intervention_requests.sql
create index idx_intervention_requests_user on intervention_requests(user_id, requested_at desc);
create index idx_intervention_requests_status on intervention_requests(status);
create index idx_intervention_request_documents_request on intervention_request_documents(request_id);

-- migration_028_agency_referrals.sql
create index idx_agency_referrals_role_status on agency_referrals(referred_to_role, status);
create index idx_agency_referrals_user on agency_referrals(user_id, created_at desc);
create index idx_agency_referral_notes_referral on agency_referral_notes(referral_id, created_at);

-- migration_029_rehabilitation_opt_in.sql
create index idx_rehabilitation_providers_jurisdiction on rehabilitation_providers(jurisdiction_id) where deleted_at is null;

-- migration_030_agency_tasks.sql
create index idx_agency_tasks_role_status on agency_tasks(assigned_to_role, status);
create index idx_agency_tasks_user on agency_tasks(user_id, created_at desc);
create index idx_agency_tasks_source_referral_auto on agency_tasks(source_referral_id) where auto_generated = true;
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

-- Case Details (victim app) - simulated eCourts integration. See
-- migration_024_court_case_details.sql for the full reasoning; sync_source
-- distinguishes simulated data from a future real eCourts data source, both
-- sharing this same table/shape so nothing else needs to change when a real
-- source is swapped in.
create table court_case_details (
  detail_id               uuid primary key default gen_random_uuid(),
  user_id                 uuid not null unique references users(user_id),
  cnr_number              text not null,
  case_type               text,
  case_category           text,
  case_sub_category       text,
  filing_number           text,
  filing_date             date,
  registration_number     text,
  registration_date       date,
  court_complex           text,
  court_establishment     text,
  court_number            text,
  coram                   jsonb,
  case_stage_label        text,
  first_hearing_date      date,
  next_hearing_date       date,
  next_hearing_purpose    text,
  case_status             text check (case_status in ('Pending', 'Disposed')),
  decision_date           date,
  disposal_nature         text,
  petitioner_names        jsonb,
  respondent_names        jsonb,
  advocate_names          jsonb,
  acts_sections           jsonb,
  fir_police_station      text,
  fir_number              text,
  fir_year                text,
  ia_details              jsonb,
  hearing_history         jsonb,
  orders                  jsonb,
  connected_cases         jsonb,
  originating_case_number text,
  transfer_history        jsonb,
  objections              jsonb,
  hearing_mode            text,
  sync_source             text not null default 'simulated' check (sync_source in ('simulated', 'ecourts_live')),
  last_synced_at          timestamptz not null default now()
);

create index idx_users_cnr on users(cnr_number) where cnr_number is not null;
create index idx_court_case_details_user on court_case_details(user_id);

COMMIT;

