-- The Alerts feed's 3-state filter (Open / Acknowledged / Resolved) had no
-- way to actually reach "Acknowledged" for an SOS event - sos_events only
-- ever tracked resolved_at, so an urgent-help alert could only ever be
-- fully Open or fully Resolved, with no "seen it, on it" middle state a
-- counsellor could set while still working the case.
alter table sos_events
  add column if not exists acknowledged_at timestamptz,
  add column if not exists acknowledged_by uuid references officials(official_id);
