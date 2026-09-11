-- migration_043: simplify the Legal Aid victim-facing lifecycle to 4 stages
-- (Submitted -> Under Review -> Public Prosecutor Assigned -> Completed, or
-- -> Rejected from Under Review) per explicit product request - "Verified"
-- and "Approved" added unnecessary review overhead between DLSA starting a
-- review and actually assigning a Public Prosecutor, with no distinct actor
-- or action of their own (same reasoning migration_040 already applied to
-- "Representative Assigned" itself, which was never a persisted state
-- either). The `legal_aid_requests_status_check` constraint is left exactly
-- as migration_040 defined it - 'Verified'/'Approved' stay valid values in
-- the schema (a narrower CHECK buys nothing and risks a live-migration
-- ordering fight like migration_042's role rename hit), the DLSA/backend
-- code paths that produced them are simply retired going forward.

-- 1. Any request already sitting in one of the two retired states needs a
--    forward path once dlsa.routes.js's /verify and /approve endpoints are
--    removed and /assign-representative starts requiring 'Under Review'
--    instead of 'Approved' - collapsing them back to 'Under Review' re-enters
--    DLSA's own action queue (Assign / Reject) under the new, simplified
--    flow rather than stranding them with no valid transition at all.
update legal_aid_requests
set status = 'Under Review', updated_at = now()
where status in ('Verified', 'Approved');

-- 2. Feedback moves from "one per recorded hearing" to "one per Public
-- Prosecutor assignment" - the victim now gets a feedback box the moment a
-- Public Prosecutor is assigned (LegalAidHubScreen.js), not only after a
-- hearing outcome has actually been recorded against their case, which
-- could be a long, unpredictable wait and isn't relevant to what the
-- feedback is actually about (the Public Prosecutor's own conduct, not a
-- specific hearing's outcome). hearing_id stays on the table (still
-- populated by nothing going forward, but no data loss for any row that
-- already has one) - just no longer required or unique.
alter table legal_aid_feedback alter column hearing_id drop not null;
drop index if exists idx_legal_aid_feedback_one_per_hearing;
create unique index idx_legal_aid_feedback_one_per_assignment on legal_aid_feedback(assignment_id);
