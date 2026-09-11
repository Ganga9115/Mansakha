-- migration_044: Legal Aid / DLSA / Public Prosecutor case lifecycle rework,
-- per explicit product spec (8 numbered requirements):
--
-- 1. A Public Prosecutor must explicitly ACCEPT an assignment before a case
--    is genuinely "Active" - DLSA's own assign action used to activate the
--    case immediately. New 'Pending Acceptance' status on
--    legal_aid_assignments (and 'Rejected', for the decline path) makes
--    this a real, distinct step instead of an instant fait accompli.
-- 2. Feedback is removed application-wide - legal_aid_feedback dropped.
-- 3. Hearing records are no longer PP-authored - they come from the
--    eCourt-simulated feed (court_case_details.hearing_history) instead.
--    legal_aid_hearings is repurposed from "PP's own hearing-outcome
--    record" to "PP's notes against one specific eCourt-reported hearing
--    date" - renamed to legal_aid_hearing_notes, with the now-meaningless
--    court/hearing_type/outcome/next_hearing_date columns dropped (that
--    data now comes from court_case_details, which already has all of it).
-- 4. Private Notes is removed entirely (legal_aid_private_notes dropped) -
--    the renamed hearing-notes table is the one remaining notes mechanism,
--    and unlike private notes it is NOT private (visible to DLSA and the
--    victim too, matching legal_aid_hearings.notes' own original "not
--    private" design intent from migration_040).

-- 1. Feedback removal - drop first since legal_aid_feedback carries an FK
-- onto legal_aid_hearings, which the next step renames/restructures.
drop table if exists legal_aid_feedback;

-- 2. legal_aid_hearings -> legal_aid_hearing_notes. hearing_date is kept as
-- the join key back to court_case_details.hearing_history's own date field
-- (that jsonb array has no stable id of its own - date is what a note
-- attaches to). court/hearing_type/outcome/next_hearing_date all become
-- redundant with eCourt's own richer record of the same hearing and are
-- dropped; notes (renamed note_text, now NOT NULL) is the only real payload
-- left, alongside who wrote it and when.
alter table legal_aid_hearings rename to legal_aid_hearing_notes;
alter table legal_aid_hearing_notes rename column hearing_id to note_id;
alter table legal_aid_hearing_notes rename column notes to note_text;
alter table legal_aid_hearing_notes drop column court;
alter table legal_aid_hearing_notes drop column hearing_type;
alter table legal_aid_hearing_notes drop column outcome;
alter table legal_aid_hearing_notes drop column next_hearing_date;
alter table legal_aid_hearing_notes alter column note_text set not null;
alter index idx_legal_aid_hearings_request rename to idx_legal_aid_hearing_notes_request;

-- 3. Private Notes removed entirely.
drop table if exists legal_aid_private_notes;

-- 4. Assignment now has a real Accept/Reject step. The one-live-assignment-
-- per-request index is widened to cover 'Pending Acceptance' too - DLSA
-- cannot assign a second Public Prosecutor while the first assignment is
-- still awaiting a decision, same as it already couldn't while one was
-- Active.
alter table legal_aid_assignments drop constraint legal_aid_assignments_status_check;
alter table legal_aid_assignments add constraint legal_aid_assignments_status_check
  check (status in ('Pending Acceptance', 'Active', 'Rejected', 'Reassigned', 'Completed'));
alter table legal_aid_assignments alter column status set default 'Pending Acceptance';

drop index if exists idx_legal_aid_assignments_one_active_per_request;
create unique index idx_legal_aid_assignments_one_live_per_request
  on legal_aid_assignments(request_id) where status in ('Pending Acceptance', 'Active');
