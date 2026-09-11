-- Detailed PDF Reports (District -> State -> National -> Ministry) - see the
-- approved plan for the full design. Two changes:
--
-- 1. period_type - reports today only ever carry period_start/period_end as
--    raw timestamps with no record of WHAT KIND of period they represent
--    (weekly/monthly/quarterly/custom calendar period vs. an arbitrary
--    range). services/reportPeriods.js resolves the real calendar boundaries
--    at generation time; this column records which resolver produced them,
--    so the frontend/PDF can label a report "August 2026" instead of just
--    a raw date range.
--
-- 2. report_recipients - reports.target_jurisdiction_id (migration_009) only
--    ever supports ONE recipient per report. The approved plan's routing
--    correction requires a report to optionally go to more than one office
--    at once (a District's report to its own State AND, optionally, National
--    and/or Ministry directly), each reviewing independently. This table
--    replaces target_jurisdiction_id as the source of truth for "who does
--    this go to" going forward - that column stays (unused by new code,
--    read-only for old rows) rather than being dropped, since existing rows
--    still reference it and dropping it would lose that history for no gain.

alter table reports add column if not exists period_type text check (period_type in ('weekly', 'monthly', 'quarterly', 'custom'));
-- Backfill so the check/UI never has to special-case a null on rows generated
-- before this migration - every pre-existing report used an arbitrary
-- start/end window, which is exactly what 'custom' means.
update reports set period_type = 'custom' where period_type is null;

-- One row per (report, recipient) - a report cc'd to 3 offices gets 3 rows,
-- each with its own independent review status. is_primary marks the
-- immediate parent (District's own State, State's own National) - always
-- required, always present; false rows are optional direct cc's (National
-- and/or Ministry added on a District's report; Ministry added on a State's
-- report). recipient_type/jurisdiction_id together handle Ministry not being
-- a real jurisdictions row (see jurisdictionTree.js's own comment on this) -
-- a Ministry recipient has recipient_type='ministry' and a null
-- jurisdiction_id, instead of inventing a fake jurisdiction to point at.
create table report_recipients (
  recipient_id     uuid primary key default gen_random_uuid(),
  report_id        uuid not null references reports(report_id),
  recipient_type   text not null check (recipient_type in ('jurisdiction', 'ministry')),
  jurisdiction_id  uuid references jurisdictions(jurisdiction_id), -- null when recipient_type = 'ministry'
  is_primary       boolean not null default false,
  -- A recipient row is only ever inserted once a report is actually sent to
  -- it - there's no per-recipient 'Draft' state (a Draft report has zero
  -- report_recipients rows at all, matching reports.status's own existing
  -- 'Draft' meaning "not sent anywhere yet").
  status           text not null default 'Submitted' check (status in ('Submitted', 'Reviewed')),
  reviewed_by      uuid references officials(official_id),
  reviewed_at      timestamptz,
  unique (report_id, recipient_type, jurisdiction_id)
);
create index idx_report_recipients_report on report_recipients(report_id);
create index idx_report_recipients_jurisdiction on report_recipients(jurisdiction_id) where recipient_type = 'jurisdiction';
-- The unique constraint above can't stop two 'ministry' rows for the same
-- report on its own - jurisdiction_id is null for both, and Postgres treats
-- NULLs as distinct in a unique constraint, so (report_id, 'ministry', null)
-- would happily insert twice. A partial unique index (no null column
-- involved) closes that gap.
create unique index idx_report_recipients_one_ministry on report_recipients(report_id) where recipient_type = 'ministry';
