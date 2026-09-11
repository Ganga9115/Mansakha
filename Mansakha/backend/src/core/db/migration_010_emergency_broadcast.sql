-- Mansakha migration 010: Emergency Broadcast dispatch_queue support
--
-- Run ONCE against the live Supabase project (SQL Editor -> New query -> paste
-- -> Run). Same DDL limitation as migrations 002-009.
--
-- Ministry Analytics & Workflow spec's Task 2C "Emergency Broadcast"
-- (POST /api/admin/broadcast) queues one dispatch_queue row per victim per
-- channel for an admin-triggered mass SMS/push send. Two changes needed:
--
-- 1. `kind`'s existing check constraint (dispatch_queue_kind_check) has no
--    value meaning "an admin broadcast to a jurisdiction" - every existing
--    kind is an individual automated trigger (checkin_due, alert, ivrs_call,
--    sms_checkin_prompt, wellness_push, ai_proactive_contact). The spec's own
--    suggested 'sms'/'push' values would violate this constraint outright.
--    Adds 'admin_broadcast_sms' and 'admin_broadcast_push' instead of
--    overloading sms_checkin_prompt/wellness_push, so
--    services/dispatchWorker.js and any future reporting can tell an
--    admin-initiated mass broadcast apart from an automated one.
-- 2. Every existing `kind` derives its delivered message from FIXED,
--    hardcoded text at drain time (services/dispatchWorker.js) - there was
--    never a need to persist freeform text on the row itself. An Emergency
--    Broadcast is admin-authored freeform text, and drainDispatchQueue may
--    not run for up to a minute after this row is inserted (see
--    startDispatchWorker's 60s tick), so that text has to survive on the row
--    for the worker to read it back later - not called out explicitly in the
--    Task 2C spec, but required for the broadcast's actual message to reach
--    delivery rather than being silently dropped. Adds `message` (the
--    broadcast body) and `priority` (mirrors alert_notifications.priority's
--    existing 'normal'/'urgent' convention) - both nullable/unused by every
--    other kind.
alter table dispatch_queue drop constraint if exists dispatch_queue_kind_check;
alter table dispatch_queue add constraint dispatch_queue_kind_check
  check (kind in ('checkin_due', 'alert', 'ivrs_call', 'sms_checkin_prompt', 'wellness_push', 'ai_proactive_contact', 'admin_broadcast_sms', 'admin_broadcast_push'));

alter table dispatch_queue add column if not exists message text;
alter table dispatch_queue add column if not exists priority text check (priority in ('normal', 'urgent'));
