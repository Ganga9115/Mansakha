-- Mansakha migration 009: Ministry Analytics & Workflow (AI insights,
-- policy tracking, upward reporting)
--
-- Run ONCE against the live Supabase project (SQL Editor -> New query ->
-- paste -> Run). Same DDL limitation as migrations 002-008.
--
-- Per the Advanced Ministry Analytics & Workflow spec: caches Gemini-
-- generated qualitative themes/predictive demand per jurisdiction, tracks
-- policies a National/State admin launches so their impact can be measured
-- against the distress trend line, and extends `reports` to support
-- District -> State -> National upward routing with commentary.

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
create index idx_jurisdiction_analytics_insights_jurisdiction on jurisdiction_analytics_insights(jurisdiction_id, generated_at desc);

create table policies (
  policy_id     uuid primary key default gen_random_uuid(),
  jurisdiction_id  uuid not null references jurisdictions(jurisdiction_id),
  title             text not null,
  description         text,
  launched_at           timestamptz not null,
  created_by              uuid references officials(official_id)
);
create index idx_policies_jurisdiction on policies(jurisdiction_id, launched_at desc);

-- Upward-routing fields - a report starts 'Draft' (or is created already
-- 'Submitted' when sent straight up), target_jurisdiction_id is who it was
-- sent TO (the parent tier), commentary is the sending admin's own
-- write-up alongside the AI snapshot, insight_id optionally links it to the
-- jurisdiction_analytics_insights row it was generated from.
alter table reports add column if not exists status text not null default 'Draft' check (status in ('Draft', 'Submitted', 'Reviewed'));
alter table reports add column if not exists target_jurisdiction_id uuid references jurisdictions(jurisdiction_id);
alter table reports add column if not exists commentary text;
alter table reports add column if not exists insight_id uuid references jurisdiction_analytics_insights(insight_id);
create index idx_reports_target_jurisdiction on reports(target_jurisdiction_id, generated_at desc);
