-- Feature improvement points 1 & 2:
-- 1. AI-chat conversations are now persisted (chat_messages already existed
--    but was never written to by the live chat screen) and a running word
--    count drives an automatic Ollama-scored distress reading every 5,000
--    words, without needing a separate daily/weekly table - it's just
--    another distress_scores row, so the existing dashboards/trends that
--    already read "most recent"/"average over N days" from that table pick
--    these up for free.
-- 2. Disengagement notices (7+ days inactive) need somewhere to land that
--    isn't tied to a real alerts/sos_events row - alert_notifications only
--    supported those two sources.
begin;

alter table users
  add column if not exists chat_word_count integer not null default 0;

alter table alert_notifications
  add column if not exists user_id uuid references users(user_id);

alter table alert_notifications
  drop constraint if exists alert_notifications_source_check;

alter table alert_notifications
  add constraint alert_notifications_source_check check (source in ('distress_score', 'sos', 'disengagement'));

-- Was "exactly alert_id XOR sos_event_id" - widened to "exactly one of
-- alert_id / sos_event_id / user_id" now that a disengagement notice has
-- neither an alert nor an sos_event to hang off of, just the user directly.
alter table alert_notifications
  drop constraint if exists alert_notifications_alert_xor_sos;

alter table alert_notifications
  add constraint alert_notifications_exactly_one_subject check (
    (alert_id is not null and sos_event_id is null and user_id is null) or
    (alert_id is null and sos_event_id is not null and user_id is null) or
    (alert_id is null and sos_event_id is null and user_id is not null)
  );

commit;
