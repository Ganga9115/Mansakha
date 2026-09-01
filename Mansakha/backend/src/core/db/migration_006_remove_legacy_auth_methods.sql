-- Mansakha migration 006: Remove legacy OTP/Google victim rows, tighten auth_method
--
-- Run ONCE against the live Supabase project (SQL Editor -> New query -> paste
-- -> Run). Same DDL limitation as migrations 002-005.
--
-- Explicit user request - victims never self-register via OTP/Google anymore
-- (Section 1.1's login is docket_number + full_name + contact number +
-- password, all staff-provisioned). The 19 rows still carrying a legacy
-- auth_method ('mobile_otp', 'email_otp', 'google') were demo/seed data with
-- no real victim behind them; delete them and everything that referenced
-- them, then tighten the constraint so no new row can use those values.
--
-- Deletes run in dependency order (children before the tables they
-- reference) since none of these foreign keys cascade on delete.
do $$
declare
  legacy_ids uuid[];
begin
  select array_agg(victim_id) into legacy_ids
    from victims where auth_method in ('mobile_otp', 'email_otp', 'google');

  if legacy_ids is not null then
    delete from interaction_signals where interaction_id in (select interaction_id from interactions where victim_id = any(legacy_ids));
    delete from alert_notifications where alert_id in (select alert_id from alerts where victim_id = any(legacy_ids))
      or sos_event_id in (select sos_event_id from sos_events where victim_id = any(legacy_ids));
    delete from interventions where victim_id = any(legacy_ids);
    delete from dispatch_queue where victim_id = any(legacy_ids) or alert_id in (select alert_id from alerts where victim_id = any(legacy_ids));
    delete from messages where victim_id = any(legacy_ids);
    delete from case_notes where victim_id = any(legacy_ids);
    delete from chat_messages where victim_id = any(legacy_ids);
    delete from journal_entries where victim_id = any(legacy_ids);
    delete from counselling_sessions where victim_id = any(legacy_ids);
    delete from consent_records where victim_id = any(legacy_ids);
    delete from audit_log where victim_id = any(legacy_ids);
    delete from alerts where victim_id = any(legacy_ids);
    delete from distress_scores where victim_id = any(legacy_ids);
    delete from sos_events where victim_id = any(legacy_ids);
    delete from interactions where victim_id = any(legacy_ids);
    delete from victim_identity where victim_id = any(legacy_ids);
    -- Re-sweep dispatch_queue/audit_log: a live dispatch scheduler can insert
    -- new rows for these victims between the passes above and this delete.
    delete from dispatch_queue where victim_id = any(legacy_ids);
    delete from audit_log where victim_id = any(legacy_ids);
    delete from victims where victim_id = any(legacy_ids);
  end if;
end $$;

alter table victims drop constraint if exists victims_auth_method_check;
alter table victims add constraint victims_auth_method_check
  check (auth_method in ('district_admin', 'data_intake_admin'));
