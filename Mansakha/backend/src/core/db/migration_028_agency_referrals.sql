-- Six new coordination roles (District Welfare Officer, Investigating Officer,
-- Protection Officer, DLSA Coordinator, Special Public Prosecutor, District
-- Magistrate) plus the agency_referrals/agency_referral_notes layer they work.
--
-- Deliberately independent of intervention_requests/interventions/alerts/
-- distress_scores - District Admin remains the sole Accept/Reject authority on
-- every existing Intervention Request, in the same route, unchanged. A
-- referral is something District Admin optionally creates AFTER already
-- deciding a case, purely for cross-agency awareness/follow-up - it never
-- intercepts or reroutes that decision. See the "Six New Coordination Roles"
-- plan for the full design rationale.

-- Widen roles - exact pattern from migration_002/005 (drop + re-add the named
-- constraint with the full allowed set, not additive syntax).
alter table roles drop constraint if exists roles_role_name_check;
alter table roles add constraint roles_role_name_check
  check (role_name in ('Ministry', 'Administration', 'Counsellor', 'Data Operator',
    'District Welfare Officer', 'Investigating Officer', 'Protection Officer',
    'DLSA Coordinator', 'Special Public Prosecutor', 'District Collector', 'Rehabilitation Officer'));
insert into roles (role_name) values
  ('District Welfare Officer'), ('Investigating Officer'), ('Protection Officer'),
  ('DLSA Coordinator'), ('Special Public Prosecutor'), ('District Collector'), ('Rehabilitation Officer')
on conflict (role_name) do nothing;

create table agency_referrals (
  referral_id              uuid primary key default gen_random_uuid(),
  user_id                  uuid not null references users(user_id), -- literal case, same convention as intervention_requests
  referred_to_role         text not null check (referred_to_role in ('District Welfare Officer',
    'Investigating Officer', 'Protection Officer', 'DLSA Coordinator', 'Special Public Prosecutor', 'District Collector', 'Rehabilitation Officer')),
  referred_by_official_id  uuid not null references officials(official_id),
  reason                   text, -- District Admin's own context for why this referral exists
  status                   text not null default 'Open' check (status in ('Open', 'Resolved')),
  metadata                 jsonb not null default '{}'::jsonb, -- role-specific structured fields (assigned lawyer, SLA deadline, trial outcome, etc.) - same data-driven pattern as intervention_types.required_documents, no schema change needed per role
  created_at               timestamptz not null default now(),
  resolved_at              timestamptz
);
create index idx_agency_referrals_role_status on agency_referrals(referred_to_role, status);
create index idx_agency_referrals_user on agency_referrals(user_id, created_at desc);

-- Generic timestamped log - covers IO's status updates, Protection Officer's
-- weekly verification, DWO/DLSA/SPP's working notes, and DM's directives with
-- one shape, same "parent row + notes" pattern as case_notes.
create table agency_referral_notes (
  note_id             uuid primary key default gen_random_uuid(),
  referral_id         uuid not null references agency_referrals(referral_id),
  author_official_id  uuid not null references officials(official_id),
  note_text           text not null,
  created_at          timestamptz not null default now()
);
create index idx_agency_referral_notes_referral on agency_referral_notes(referral_id, created_at);
