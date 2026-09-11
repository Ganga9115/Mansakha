-- Closes a real gap found in this session's audit: Ministry's "reset a
-- forgotten/compromised password" flow (PATCH /api/ministry/staff/:officialId)
-- updated password_hash but never invalidated any session token already
-- issued for that account - since tokens carry no `exp` claim and verifyToken
-- had no way to know a password changed, a compromised session stayed fully
-- valid indefinitely even after the password meant to lock it out was reset.
-- NULL means "never changed since this column existed" - verifyToken treats
-- that as not-a-reason-to-reject, same null-safe pattern as last_active_at.
alter table officials add column if not exists password_changed_at timestamptz;
