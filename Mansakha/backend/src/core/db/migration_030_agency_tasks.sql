-- Structured, trackable directives/tasks across all 7 coordination roles -
-- replaces "leave a free-text note and hope someone reads it" with a real
-- action item: a specific role, a specific action, a due date, and a
-- Pending/Completed status the assigned role must actually clear. Any of
-- the 7 roles (or District Admin) can create a task targeting any role for
-- a case - not just District Collector, though DC's committee-review
-- directives are the primary use case this was built for.
--
-- Independent of agency_referral_notes (which stays as free-text
-- commentary/log) and of intervention_requests/interventions/alerts/
-- distress_scores - same "purely additive, District Admin keeps sole
-- Intervention Request authority" rule as agency_referrals itself.
create table agency_tasks (
  task_id                 uuid primary key default gen_random_uuid(),
  user_id                 uuid not null references users(user_id),
  source_referral_id      uuid references agency_referrals(referral_id), -- which referral/case context this came from - null for some auto-generated escalations with no single obvious source
  assigned_to_role        text not null check (assigned_to_role in ('District Welfare Officer',
    'Investigating Officer', 'Protection Officer', 'DLSA Coordinator', 'Special Public Prosecutor', 'District Collector', 'Rehabilitation Officer')),
  created_by_official_id  uuid references officials(official_id), -- null for an auto-generated escalation task
  action                  text not null,
  due_at                  timestamptz,
  status                  text not null default 'Pending' check (status in ('Pending', 'Completed')),
  completed_at            timestamptz,
  auto_generated          boolean not null default false, -- true for staleness/SLA-miss escalation tasks (agencyEscalationChecker.js), false for a human-created directive
  created_at              timestamptz not null default now()
);
create index idx_agency_tasks_role_status on agency_tasks(assigned_to_role, status);
create index idx_agency_tasks_user on agency_tasks(user_id, created_at desc);
-- One auto-generated escalation task per stale/SLA-missed referral, not one
-- per worker tick - the checker looks this up before inserting.
create index idx_agency_tasks_source_referral_auto on agency_tasks(source_referral_id) where auto_generated = true;
