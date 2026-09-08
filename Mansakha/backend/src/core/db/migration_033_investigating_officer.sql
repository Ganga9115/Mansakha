-- Reinstates Investigating Officer as a real, separate role (previously
-- retired, its one piece of real value absorbed into Protection Officer)
-- with genuine substance: reviewing the assigned case, investigating,
-- recording victim-safe case-progress updates (accused status,
-- investigation progress, chargesheet), and alerting Protection Officer on
-- threat detection. Introduces a real Police Station concept - more
-- granular than the existing district-level jurisdictions, since a real IO
-- is scoped to the station where the FIR was filed, not the whole district.

create table police_stations (
  station_id      uuid primary key default gen_random_uuid(),
  name            text not null,
  jurisdiction_id uuid not null references jurisdictions(jurisdiction_id), -- district-level
  deleted_at      timestamptz -- soft-delete, matches languages/case_types' own pattern
);

-- Mirrors official_roles.jurisdiction_id/provider_id's own pattern - scope
-- lives on the role grant, not the account, since one official could in
-- principle hold multiple role grants.
alter table official_roles add column if not exists station_id uuid references police_stations(station_id);

-- Which station's Investigating Officer(s) this case is assigned to - set
-- at intake (Data Operator), changeable later ("case transfer" in the
-- flowchart is modeled as changing this, logged as a case_notes entry,
-- rather than a separate structured status field).
alter table users add column if not exists station_id uuid references police_stations(station_id);

-- IO's own structured, victim-safe case-progress record - one per case
-- (every registered case gets investigated, so this isn't a referral-
-- triggered escalation like agency_referrals - it's closer to how every
-- case gets an assigned counsellor). Deliberately separate from
-- users.case_stage (the shared case-lifecycle driver every role's own
-- stage-gating already reads from) - this is IO's own richer internal
-- detail, a curated subset of which (investigation_progress,
-- chargesheet_status) is shown to the victim, explicitly excluding raw
-- evidence (that stays in case_notes, IO-authored, same table Counsellors
-- already use for their own case notes).
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
