-- Rehabilitation is a post-case-closure phase, victim-initiated: the victim
-- is asked to opt in once their case reaches 'Case Closed', picks a real
-- provider (government center or NGO), and only then does the
-- Rehabilitation Officer referral get created. See user.routes.js's
-- POST /rehabilitation-opt-in and GET /rehabilitation-providers.
--
-- No change to the users.case_stage CHECK constraint - it already allows
-- exactly the 5 values needed ('Investigation','Trial','Rehabilitation',
-- 'Compensation','Case Closed'), the constraint is a set, not an order.
-- What changes is application-level logic (CASE_STAGES_OPEN,
-- CASE_STAGE_SCORES in userProvisioning.js) treating Rehabilitation as
-- reachable only from Case Closed now, not as a mid-case stage.

-- A referral can now be created by a victim's own opt-in, not only by an
-- official - loosen the NOT NULL (safe, backward-compatible: every existing
-- row already has an official_id, so no existing data violates this) and
-- add the alternate actor column.
alter table agency_referrals alter column referred_by_official_id drop not null;
alter table agency_referrals add column if not exists referred_by_user_id uuid references users(user_id);

-- Real rehabilitation providers a victim can choose from - Government or
-- NGO, Ministry-manageable (same soft-delete pattern as languages/case_types).
-- jurisdiction_id null means "available nationwide" rather than scoped to
-- one district.
create table rehabilitation_providers (
  provider_id     uuid primary key default gen_random_uuid(),
  name            text not null,
  provider_type   text not null check (provider_type in ('Government', 'NGO')),
  jurisdiction_id uuid references jurisdictions(jurisdiction_id),
  contact_info    text,
  deleted_at      timestamptz
);

-- Honest seed data: real, generically-named Indian government administrative
-- bodies (not a fabricated brand), plus a clearly-labeled placeholder for
-- NGO partners pending real vetting/onboarding by Ministry - never a
-- specific NGO name asserted as real without verification.
insert into rehabilitation_providers (name, provider_type, contact_info) values
  ('District Social Welfare Department - Rehabilitation Cell', 'Government', 'Contact your District Welfare Officer for local details.'),
  ('State SC/ST Welfare Department', 'Government', 'Contact your District Welfare Officer for local details.'),
  ('NGO Partner (pending Ministry onboarding)', 'NGO', 'No NGO partners are configured yet - Ministry can add real, vetted partners via System Configuration.');

create index idx_rehabilitation_providers_jurisdiction on rehabilitation_providers(jurisdiction_id) where deleted_at is null;
