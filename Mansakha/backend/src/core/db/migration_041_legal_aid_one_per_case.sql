-- Legal Aid: exactly one request per case, ever - not just "one in flight
-- at a time" (migration_040's own idx_legal_aid_requests_one_open_per_case
-- already stopped a SECOND concurrent request, but let a case submit a
-- fresh one again once its first reached Rejected/Completed). Explicit
-- product decision: a docket gets one shot at Legal Aid, matching how a
-- real one-time statutory entitlement works, not an appeal/retry loop.
--
-- Same "drop and recreate the named index" convention this codebase already
-- uses for constraint changes (see migration_039's designation relabel) -
-- Postgres has no ALTER INDEX for changing a WHERE clause.
drop index if exists idx_legal_aid_requests_one_open_per_case;
create unique index idx_legal_aid_requests_one_open_per_case
  on legal_aid_requests(user_id);
