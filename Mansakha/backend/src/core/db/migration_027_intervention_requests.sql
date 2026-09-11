-- Victim-Initiated Intervention Requests - see the approved plan for the
-- full design. Flips the direction of the existing `interventions` table:
-- today a Counsellor unilaterally recommends one; going forward, a victim
-- REQUESTS one (with proof documents) and their District Admin Accepts or
-- Rejects it. `interventions` itself is unchanged - an Accepted request
-- inserts a real row into it (so the Reports feature's Intervention Summary
-- section, built earlier, keeps working unmodified), it just gains a new
-- upstream request/review lifecycle that didn't exist before.

-- Per-type required-document list, driving the request form - kept
-- data-driven (not hardcoded in route/frontend code) since Ministry already
-- has full CRUD on intervention_types via System Configuration and should
-- be able to adjust these without a redeploy. Real-world grounding (SC/ST
-- PoA Act victims): Legal Aid is an automatic NALSA entitlement gated on
-- caste proof, not income; Financial Assistance mirrors the PoA Act Rules
-- 1995 victim compensation scheme (FIR-triggered, caste-proof-gated, paid
-- via bank transfer); Witness Protection/Relocation's police threat-
-- assessment is marked optional since a victim can't always obtain one
-- themselves. Counselling is deliberately left at the default empty list -
-- excluded from this flow entirely (confirmed with the user): it has no
-- real-world proof/eligibility gate, and the app already has a simpler
-- self-service path for it (users.opted_for_manual_counsellor).
alter table intervention_types add column if not exists required_documents jsonb not null default '[]'::jsonb;

update intervention_types set required_documents =
  '[{"label":"Medical Certificate / Diagnosis Report","required":true},{"label":"Hospital Bill or Treatment Estimate","required":false}]'::jsonb
  where name = 'Medical';
update intervention_types set required_documents =
  '[{"label":"FIR Copy / Case Reference","required":true},{"label":"Police Threat Assessment","required":false}]'::jsonb
  where name = 'Witness Protection';
update intervention_types set required_documents =
  '[{"label":"FIR Copy / Case Reference","required":true},{"label":"Police Threat Assessment or Recommendation","required":false},{"label":"Proof of Current Address","required":true}]'::jsonb
  where name = 'Relocation';
update intervention_types set required_documents =
  '[{"label":"FIR Copy","required":true},{"label":"Caste Certificate (SC/ST Proof)","required":true},{"label":"Bank Passbook / Account Proof","required":true}]'::jsonb
  where name = 'Financial Assistance';
update intervention_types set required_documents =
  '[{"label":"Caste Certificate (SC/ST Proof)","required":true},{"label":"FIR Copy / Case Reference","required":true},{"label":"Aadhaar or Photo ID","required":true}]'::jsonb
  where name = 'Legal Aid';
update intervention_types set required_documents =
  '[{"label":"Caste Certificate (SC/ST Proof)","required":true},{"label":"Case Status Document (Chargesheet/Disposal)","required":false},{"label":"Bank Passbook / Account Proof","required":true}]'::jsonb
  where name = 'Rehabilitation';
-- Counselling: no update - stays '[]'::jsonb (the column default).

-- A request belongs to one literal case (`user_id`), NOT resolved through
-- linked_to_user_id - same convention as case_notes/interventions
-- themselves (a person's dependent case has its own separate history, not
-- merged into the anchor's). No status transition back to 'Pending' once
-- decided - a rejected request can't be silently un-rejected, a fresh
-- request is the only way forward, matching how a real domicile-certificate
-- rejection works (reapply, don't edit the old application).
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
create index idx_intervention_requests_user on intervention_requests(user_id, requested_at desc);
create index idx_intervention_requests_status on intervention_requests(status);

-- One row per uploaded proof document - document_label matches one of the
-- request's own intervention_type's required_documents labels (not
-- enforced by a DB constraint, since that list is itself editable jsonb;
-- enforced in the route handler instead).
create table intervention_request_documents (
  document_id    uuid primary key default gen_random_uuid(),
  request_id     uuid not null references intervention_requests(request_id),
  document_label text not null,
  storage_path   text not null,
  content_type   text,
  uploaded_at    timestamptz not null default now()
);
create index idx_intervention_request_documents_request on intervention_request_documents(request_id);
