-- Case Details (victim app) - simulated eCourts integration. cnr_number
-- lives on users itself (one per docket, exactly like docket_number - NOT
-- resolved through linked_to_user_id, since a CNR belongs to one specific
-- case file, not a person's whole activity history - same reasoning
-- case_notes/interventions already use over distress_scores).
--
-- No real eCourts API exists for free/official use (confirmed - only paid,
-- unofficial third-party scrapers of the government portal), so this is
-- deliberately simulated for now (see core/services/courtCaseSimulation.js),
-- architected so a real data source can be swapped in later without any
-- schema change - sync_source distinguishes the two, and last_synced_at
-- drives the same "regenerate if stale" trigger a real sync would use.
begin;

alter table users add column if not exists cnr_number text unique;
create index if not exists idx_users_cnr on users(cnr_number) where cnr_number is not null;

create table court_case_details (
  detail_id               uuid primary key default gen_random_uuid(),
  user_id                 uuid not null unique references users(user_id), -- one row per docket, not per person
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
  coram                   jsonb,               -- [judgeName, ...] - 1 for district courts, 2+ for High Court
  case_stage_label        text,                -- eCourts' own wording, distinct from users.case_stage
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
  ia_details              jsonb,               -- [{iaNumber, iaType, filingDate, status}] - bail applications live here
  hearing_history         jsonb,               -- [{date, business}]
  orders                  jsonb,               -- [{title, date, type}]
  connected_cases         jsonb,               -- [cnrNumber, ...]
  originating_case_number text,
  transfer_history        jsonb,
  objections              jsonb,
  hearing_mode            text,
  sync_source             text not null default 'simulated' check (sync_source in ('simulated', 'ecourts_live')),
  last_synced_at          timestamptz not null default now()
);
create index idx_court_case_details_user on court_case_details(user_id);

commit;
