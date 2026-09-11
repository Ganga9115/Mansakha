-- Adds 'weekly_review' as a distinct alert_notifications source, separate
-- from the existing 'distress_score'/'sos'/'disengagement'. A weekly
-- (105-question) aggregate score already runs through applyStressResponse
-- like any other score (queues a Moderate/High dispatch, or a Critical
-- alert) - but that response is purely risk-level-driven and fires or not
-- exactly like it would for any routine score. This adds a SEPARATE,
-- unconditional notification (any risk level) tagged distinctly so
-- counsellors/admins can tell "this user just completed a weekly review"
-- apart from routine per-check-in noise, per explicit request.
begin;

alter table alert_notifications
  drop constraint if exists alert_notifications_source_check;

alter table alert_notifications
  add constraint alert_notifications_source_check
  check (source in ('distress_score', 'sos', 'disengagement', 'weekly_review'));

commit;
