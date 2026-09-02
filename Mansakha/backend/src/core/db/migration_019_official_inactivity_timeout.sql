-- Staff/admin/ministry sessions ("official" accounts) log out after 8 hours
-- of INACTIVITY, not 8 hours from login - the JWT itself no longer carries
-- an `exp` claim (migration to no-expiry tokens, this same session), so the
-- sliding window is tracked here instead and enforced in verifyToken.js on
-- every request. Victim/user accounts get no such column and no such check
-- at all - explicit request that they never auto-logout, regardless of
-- inactivity.
alter table officials add column if not exists last_active_at timestamptz;
