-- Legal Aid: the real DLSA (District Legal Services Authority) workflow.
--
-- Until now, "Legal Aid" was handled entirely by the generic machinery every
-- other Request-Assistance type shares: intervention_requests (Pending/
-- Accepted/Rejected only) -> on Accept, one agency_referrals row (Open/
-- Resolved only, referred_to_role='DLSA Coordinator'), with the assigned
-- lawyer just a free-text name typed into that row's metadata jsonb and
-- victim feedback a single overwritable metadata.lawyerFeedback blob. There
-- was no real Legal Representative account, no hearing record, no private
-- representative notes, and no verification/assignment lifecycle beyond a
-- binary accept/reject.
--
-- This migration replaces that pipeline going forward with a dedicated one:
-- a real 7-stage request lifecycle (Submitted -> Under Review -> Verified ->
-- Approved -> Active -> Completed, with a Submitted/Under Review -> Rejected
-- branch - "Representative Assigned" is not its own DB state, since nothing
-- separates it in time or actor from the assignment that produces Active;
-- the app layer still records that sub-step in audit_log.details), a real
-- Legal Representative staff role with its own login and jurisdiction-scoped
-- assignment, structured hearing-outcome records distinct from private
-- representative notes, and structured per-hearing victim feedback that
-- routes poor ratings to DLSA for a real reassignment decision.
--
-- Deliberately NOT built by widening agency_referrals/intervention_requests:
-- both are shared by several unrelated roles/types and can't express this
-- lifecycle without leaking Legal-Aid-only states onto them. Every new table
-- here still references the existing case directly via user_id (the literal
-- docket, same convention intervention_requests/case_notes already use -
-- never linked_to_user_id, which only matters when LISTING across a case
-- family, not when filing something against one specific case) - no
-- duplicate case record is created anywhere in this migration.
--
-- The old intake path is frozen, not deleted, so nothing already in flight
-- breaks: see step 1 below, and backend/src/dlsa/routes/dlsa.routes.js /
-- backend/src/user/routes/user.routes.js, both of which keep their old
-- routes mounted unmodified after this ships.

-- 1. Freeze the old intake - same soft-delete convention already used
-- elsewhere on this table (e.g. Rehabilitation's own retirement). With
-- deleted_at set, GET /api/user/intervention-types stops offering "Legal
-- Aid" and POST /api/user/intervention-requests rejects new submissions of
-- it, with zero route code changes (both already filter on deleted_at is
-- null). This is also what makes giving DLSA Coordinator a jurisdiction
-- below safe without a backfill: no new unscoped Legal Aid intervention
-- request can appear after this line runs, only pre-existing ones remain
-- reachable through the old (now nav-unlinked but still-mounted) queue.
update intervention_types set deleted_at = now() where name = 'Legal Aid' and deleted_at is null;

-- 2. New role: Legal Representative. Exact widening pattern already used by
-- migration_002/005/028 - drop and re-add the named constraint with the full
-- allowed set, never additive syntax.
alter table roles drop constraint if exists roles_role_name_check;
alter table roles add constraint roles_role_name_check
  check (role_name in ('Ministry', 'Administration', 'Counsellor', 'Data Operator',
    'District Welfare Officer', 'Investigating Officer', 'Protection Officer',
    'DLSA Coordinator', 'Special Public Prosecutor', 'District Collector', 'Rehabilitation Officer',
    'Legal Representative'));
insert into roles (role_name) values ('Legal Representative') on conflict (role_name) do nothing;

-- 3. The request itself - the authoritative record for one Legal Aid
-- request end to end. reviewed_by_official_id/reviewed_at is a "who/when
-- last touched this" convenience for the queue list only - it can only hold
-- the most recent of up to five separate DLSA actions (start-review, verify,
-- reject, approve, assign), so it is NOT a full transition history. The real
-- per-transition trail (who, from-status, to-status, reason) is written to
-- audit_log.details (added in step 9) on every transition.
create table legal_aid_requests (
  request_id               uuid primary key default gen_random_uuid(),
  user_id                  uuid not null references users(user_id),
  reason                   text not null,
  description              text,
  status                   text not null default 'Submitted' check (status in
    ('Submitted', 'Under Review', 'Verified', 'Rejected', 'Approved', 'Active', 'Completed')),
  rejection_reason         text,
  reviewed_by_official_id  uuid references officials(official_id),
  reviewed_at              timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now() -- set manually on every UPDATE (no triggers exist anywhere in this schema - matches investigation_records' own manually-maintained updated_at)
);
create index idx_legal_aid_requests_user on legal_aid_requests(user_id, created_at desc);
create index idx_legal_aid_requests_status on legal_aid_requests(status);
-- One non-terminal request per case at a time - a victim's second submission
-- while one is already in flight is a genuine duplicate, not a valid re-ask.
create unique index idx_legal_aid_requests_one_open_per_case
  on legal_aid_requests(user_id) where status not in ('Rejected', 'Completed');

-- 4. Documents attached to a request - either a genuinely new upload, or a
-- reference to a document this case already has on file elsewhere (never a
-- copy). Two real nullable FKs rather than a generic (table_name, id) pair:
-- this codebase's own existing idiom for "exactly one of several possible
-- referenced things" (alert_notifications_exactly_one_subject below) is a
-- named CHECK over real FK columns, not a polymorphic reference - that gets
-- real referential integrity and a normal join instead of a dangling
-- (text, uuid) pair no foreign key can protect.
create table legal_aid_request_documents (
  document_id                                uuid primary key default gen_random_uuid(),
  request_id                                 uuid not null references legal_aid_requests(request_id),
  source                                     text not null check (source in ('existing_case_document', 'uploaded')),
  document_label                             text not null,
  storage_path                               text, -- set only when source='uploaded' (this request's own private bucket, see storage.buckets insert below)
  storage_bucket                             text,
  linked_intervention_request_document_id    uuid references intervention_request_documents(document_id), -- set only when source='existing_case_document' and the original is a prior proof upload (e.g. caste certificate)
  linked_investigation_record_id             uuid references investigation_records(investigation_id), -- set only when source='existing_case_document' and the original is the case's own FIR/chargesheet
  content_type                               text,
  uploaded_at                                timestamptz not null default now(),
  constraint legal_aid_request_documents_exactly_one_reference check (
    (source = 'uploaded' and storage_path is not null and storage_bucket is not null
      and linked_intervention_request_document_id is null and linked_investigation_record_id is null)
    or (source = 'existing_case_document' and storage_path is null and storage_bucket is null
      and linked_intervention_request_document_id is not null and linked_investigation_record_id is null)
    or (source = 'existing_case_document' and storage_path is null and storage_bucket is null
      and linked_intervention_request_document_id is null and linked_investigation_record_id is not null)
  )
);
create index idx_legal_aid_request_documents_request on legal_aid_request_documents(request_id);

-- Private, same discipline as every other victim-facing bucket in this app
-- (intervention-proofs, case-documents) - retrieval always through a
-- short-lived signed URL, never a permanent public link.
insert into storage.buckets (id, name, public)
values ('legal-aid-documents', 'legal-aid-documents', false)
on conflict (id) do nothing;

-- 5. Representative assignment - one row per representative's tenure on a
-- request. Never updated in place across a reassignment (a new row is
-- inserted, the old one's status changes) so the full assignment history is
-- always preserved. The partial unique index is the DB-level guarantee that
-- exactly one representative is ever "Active" on a given request at once.
create table legal_aid_assignments (
  assignment_id                uuid primary key default gen_random_uuid(),
  request_id                   uuid not null references legal_aid_requests(request_id),
  representative_official_id   uuid not null references officials(official_id),
  assigned_by_official_id      uuid not null references officials(official_id), -- the DLSA who made this call
  status                       text not null default 'Active' check (status in ('Active', 'Reassigned', 'Completed')),
  ended_reason                 text, -- set when status moves off 'Active' via reassignment; null for a natural 'Completed'
  ended_at                     timestamptz,
  assigned_at                  timestamptz not null default now()
);
create unique index idx_legal_aid_assignments_one_active_per_request
  on legal_aid_assignments(request_id) where status = 'Active';
create index idx_legal_aid_assignments_representative on legal_aid_assignments(representative_official_id, status);

-- 6. Official hearing-outcome records - representative-authored, tied to one
-- specific Legal Aid assignment (assignment_id, preserved even after a
-- reassignment moves the request on to someone else), visible to the
-- victim, DLSA, and the representative alike. Deliberately unrelated to, and
-- not foreign-keyed against, court_case_details.hearing_history (migration_024) -
-- that column is the simulated eCourt sync's own case-wide, auto-generated
-- hearing feed already shown on the victim's Case Details screen; this table
-- is a distinct, representative-entered record scoped to this Legal Aid
-- engagement specifically. hearing_type is free text, not a CHECK enum -
-- real court hearing-stage vocabulary varies by jurisdiction the same way
-- official_roles.designation already does.
create table legal_aid_hearings (
  hearing_id                uuid primary key default gen_random_uuid(),
  request_id                uuid not null references legal_aid_requests(request_id),
  assignment_id              uuid not null references legal_aid_assignments(assignment_id),
  recorded_by_official_id    uuid not null references officials(official_id),
  hearing_date                date not null,
  court                        text,
  hearing_type                  text,
  outcome                        text not null,
  next_hearing_date               date,
  notes                             text, -- official case-record notes - explicitly NOT private, see legal_aid_private_notes below
  created_at                          timestamptz not null default now()
);
create index idx_legal_aid_hearings_request on legal_aid_hearings(request_id, hearing_date desc);

-- 7. Private representative notes - strictly internal working notes, never
-- part of the official case record. There is no existing author-scoped-
-- visibility table anywhere in this app to model this on (case_notes and
-- agency_referral_notes are both visible to any official with route access,
-- never filtered to their own author) - this is a genuinely new pattern
-- here, not a copy of one. Since this API always runs as the Supabase
-- service-role key (RLS is enabled per security_and_realtime.sql but bypassed
-- by design everywhere, authorization is always enforced in the query layer,
-- not via RLS), the real enforcement is at the route layer: this table is
-- only ever queried from routes mounted under the Legal Representative role's
-- own router (never under /api/dlsa/* or /api/user/*), and every query there
-- additionally filters on author_official_id = the caller's own id.
create table legal_aid_private_notes (
  note_id              uuid primary key default gen_random_uuid(),
  request_id           uuid not null references legal_aid_requests(request_id),
  assignment_id        uuid not null references legal_aid_assignments(assignment_id),
  author_official_id   uuid not null references officials(official_id),
  note_text            text not null,
  created_at           timestamptz not null default now()
);
create index idx_legal_aid_private_notes_request_author on legal_aid_private_notes(request_id, author_official_id);

-- 8. Victim feedback on the assigned representative, tied to one specific
-- hearing (never a whole-case average) so DLSA's review always has a
-- concrete reference point. One feedback per hearing (unique index below) -
-- a victim cannot edit another victim's feedback because every write is
-- always scoped to submitted_by_user_id = the caller's own id at the route
-- layer, and cannot overwrite their own either, by the same index.
-- dlsa_reviewed_at stays null forever for a good rating (no review is ever
-- triggered) and is stamped once DLSA has looked at a poor one and decided
-- (continue or reassign) - the actual "poor" threshold is a named constant
-- in application code (core/services/legalAidConstants.js), not a DB CHECK,
-- since it is the one number in this feature likeliest to be tuned later.
create table legal_aid_feedback (
  feedback_id            uuid primary key default gen_random_uuid(),
  request_id             uuid not null references legal_aid_requests(request_id),
  assignment_id          uuid not null references legal_aid_assignments(assignment_id),
  hearing_id             uuid not null references legal_aid_hearings(hearing_id),
  submitted_by_user_id   uuid not null references users(user_id),
  rating                 integer not null check (rating between 1 and 5),
  comment                text,
  dlsa_reviewed_at       timestamptz,
  created_at             timestamptz not null default now()
);
create unique index idx_legal_aid_feedback_one_per_hearing on legal_aid_feedback(hearing_id);

-- 9. audit_log gets one additive, nullable column so a transition's
-- previous/new state can actually be recorded (today's audit_log has
-- nowhere to put that). Every existing writeAuditLog() call site is
-- unaffected - the new argument defaults to null.
alter table audit_log add column if not exists details jsonb;

-- 10. New alert_notifications source value for Legal Aid staff notifications
-- (submission -> jurisdictional DLSA, assignment/reassignment -> the
-- representative, poor feedback -> jurisdictional DLSA) - same user_id-only
-- shape already used by 'disengagement'/'weekly_review'.
alter table alert_notifications drop constraint if exists alert_notifications_source_check;
alter table alert_notifications add constraint alert_notifications_source_check
  check (source in ('distress_score', 'sos', 'disengagement', 'weekly_review', 'legal_aid'));

-- Note: official_roles.jurisdiction_id is already nullable (confirmed live -
-- no not-null constraint), so making DLSA Coordinator jurisdiction-required
-- going forward (backend/src/ministry/routes/ministry.routes.js) only affects
-- *new* DLSA accounts created after this ships. Any DLSA Coordinator account
-- that predates this migration simply sees an empty, jurisdictionAssigned:false
-- Legal Aid Requests queue until Ministry edits it a jurisdiction - no
-- backfill UPDATE is required or performed here.
