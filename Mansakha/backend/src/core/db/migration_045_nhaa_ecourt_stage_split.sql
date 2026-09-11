-- migration_045: separate NHaa's own case_stage from the real (simulated)
-- eCourt record instead of NHaa's stage just being an independent timer
-- mislabeled "eCourt sync" - see ecourtStageSync.js's own rewritten header
-- comment for the full reasoning. Concretely:
--
-- 1. NHaa's own case_stage shrinks to 3 values (Investigation -> Trial ->
--    Compensation). Rehabilitation is no longer a stage - it's an opt-in
--    fact triggered once a case REACHES Compensation. "Case Closed" is no
--    longer a stage either - a case's own end is now the case_completed_at
--    fact below, not a stage value, since ending is really a credentials/
--    access event, not a place a case procedurally "is".
-- 2. Rehabilitation moves from 4 per-docket columns on `users` to one row
--    per PERSON (anchor) in a new rehabilitation_status table - per
--    explicit product decision, rehabilitation is the same fact across
--    every case (docket) a person has, unlike compensation, which stays
--    genuinely per-case.
-- 3. case_completed_at (per docket, NOT per person) - the real "this case's
--    own credentials/access should end" fact, set once its own
--    compensation is fully paid AND the person's (shared) rehabilitation is
--    resolved (declined, or opted-in-and-closed). Once every case under a
--    person's anchor has this set, the anchor's own login (users.status)
--    is deactivated - see caseCompletion.js.

-- 1. Rehabilitation, promoted to the person (anchor) level.
create table rehabilitation_status (
  anchor_user_id         uuid primary key references users(user_id),
  opted_in_at            timestamptz,
  declined_at            timestamptz,
  provider_id            uuid references rehabilitation_providers(provider_id),
  closed_at              timestamptz,
  closed_by_official_id  uuid references officials(official_id),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

-- Carry forward whatever any of a person's own cases already recorded -
-- opted_in_at/declined_at were meant to be the same fact everywhere already,
-- this just resolves the (should-be-rare) case where more than one of a
-- person's dockets disagrees by taking the earliest opt-in/decline (the
-- fact that actually happened first) and any provider choice that came with it.
insert into rehabilitation_status (anchor_user_id, opted_in_at, declined_at, provider_id)
select
  coalesce(linked_to_user_id, user_id) as anchor_user_id,
  min(rehabilitation_opted_in_at) as opted_in_at,
  min(rehabilitation_declined_at) as declined_at,
  (array_agg(rp.provider_id) filter (where rp.provider_id is not null))[1] as provider_id
from users u
left join lateral (
  select ar.metadata->>'providerId' as provider_id_text
  from agency_referrals ar
  where ar.user_id = u.user_id and ar.referred_to_role = 'Rehabilitation Officer'
  order by ar.created_at desc limit 1
) ref on true
left join rehabilitation_providers rp on rp.provider_id::text = ref.provider_id_text
where u.rehabilitation_opted_in_at is not null or u.rehabilitation_declined_at is not null
group by coalesce(linked_to_user_id, user_id)
on conflict (anchor_user_id) do nothing;

-- 2. Per-docket case completion fact - replaces the role 'Case Closed'
-- used to play as a case_stage value.
alter table users add column if not exists case_completed_at timestamptz;

-- Existing 'Case Closed' rows: per explicit product decision, remapped to
-- 'Compensation' (the closest real stage) AND marked complete immediately -
-- these were already fully closed under the old model, and the live
-- application code re-runs the real completion check against them anyway
-- (see backfillCaseCompletion in caseCompletion.js, run once right after
-- this migration) rather than trusting this blanket timestamp as final.
update users set case_stage = 'Compensation', case_completed_at = now()
where case_stage = 'Case Closed';

-- Existing 'Rehabilitation' rows: remapped to 'Compensation' - the stage
-- Rehabilitation used to sit between (Trial) and (Compensation) collapses
-- forward into Compensation, matching "Rehabilitation is not a stage,
-- Compensation is where the opt-in question now lives."
update users set case_stage = 'Compensation' where case_stage = 'Rehabilitation';

alter table users drop constraint if exists victims_case_stage_check;
alter table users add constraint victims_case_stage_check
  check (case_stage = any (array['Investigation', 'Trial', 'Compensation']));

-- 3. Old per-docket rehabilitation columns retired - superseded by
-- rehabilitation_status above.
alter table users drop column if exists rehabilitation_opted_in_at;
alter table users drop column if exists rehabilitation_declined_at;
alter table users drop column if exists rehabilitation_closure_pending_ack;
alter table users drop column if exists rehabilitation_continued_after_closure;
