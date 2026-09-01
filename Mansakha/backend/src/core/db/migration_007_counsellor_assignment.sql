-- Migration 007: Automated counsellor-assignment scoring + case closure + WhatsApp
--
-- Run ONCE against the live Supabase project (SQL Editor, or via the same
-- pg-based one-off script pattern used for migrations 002-006). Safe to re-run.

-- 'Case Closed' is a new terminal case_stage, settable only by Data Operator
-- (routes/dataIntake.js) - District Admin's case_stage edits stay restricted
-- to the original 4 (services/victimProvisioning.js enforces this in code,
-- not at the DB level, since Postgres CHECK constraints can't see who's calling).
alter table victims drop constraint if exists victims_case_stage_check;
alter table victims add constraint victims_case_stage_check
  check (case_stage in ('Investigation', 'Trial', 'Rehabilitation', 'Compensation', 'Case Closed'));

-- Feature: victim opts for manual counselling -> "Call" redirects to a tel:
-- link using officials.phone (already exists); "WhatsApp" needs its own
-- number since a counsellor's WhatsApp isn't always the same as their
-- official contact number.
alter table officials add column if not exists whatsapp_number text;
