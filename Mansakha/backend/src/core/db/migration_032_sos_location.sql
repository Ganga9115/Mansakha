-- Purely additive: one nullable column on the existing sos_events table so
-- "Get Help Now" can carry the victim's current location (best-effort,
-- device-permission-dependent, same as threat-report's location capture)
-- alongside the alert it already sends. No existing column, query, or
-- behavior is touched - every current reader of sos_events simply doesn't
-- reference this new field.
alter table sos_events add column if not exists location jsonb;
