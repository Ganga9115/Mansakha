-- Makes case_stage exclusively eCourt-authoritative, and separates
-- "opted for rehabilitation" (an application-side decision) from "case is
-- in the Rehabilitation stage" (a court-process fact eCourt sets) - these
-- were previously conflated (opting in used to directly set case_stage
-- itself). New strict stage order: Investigation -> Trial -> Rehabilitation
-- -> Compensation -> Case Closed.

-- When this case's own case_stage should next be advanced by the
-- (simulated) eCourt sync worker - null once the case reaches 'Case Closed'
-- (terminal, no further eCourt-driven advancement). Set at case creation
-- and after every transition; the sync worker is a pure scheduled-time
-- check against this column, nothing more.
alter table users add column if not exists next_ecourt_stage_at timestamptz;

-- The victim's own decision to join the rehabilitation support program,
-- independent of case_stage - a case can be in the Rehabilitation stage
-- (per eCourt) without the victim having opted in yet, and opting in never
-- itself changes case_stage (only eCourt does that).
alter table users add column if not exists rehabilitation_opted_in_at timestamptz;

-- The victim declined the rehabilitation offer for the CURRENT Rehabilitation
-- stage - so the mandatory decision gate doesn't ask again every app open
-- for the remainder of that stage. Distinct from opted_in (mutually
-- exclusive - only one is ever set at a time for the same stage instance).
alter table users add column if not exists rehabilitation_declined_at timestamptz;

-- Set true exactly when eCourt closes a case that was in Rehabilitation AND
-- the victim had opted in - the trigger for the special "your case has been
-- closed - continue with Rehabilitation anyway?" popup. Cleared once the
-- victim answers either way (see POST /rehabilitation-closure-continue and
-- .../rehabilitation-closure-end in user.routes.js).
alter table users add column if not exists rehabilitation_closure_pending_ack boolean not null default false;

-- If the victim chooses to continue Rehabilitation support after their case
-- was closed by eCourt (the popup's "Yes"), the app keeps serving the
-- isolated Rehabilitation context for this docket even though case_stage
-- is now 'Case Closed' - this flag is what keeps that docket's app access
-- alive despite the closed-docket rule that would otherwise apply.
alter table users add column if not exists rehabilitation_continued_after_closure boolean not null default false;
