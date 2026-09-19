-- Data Operator and District Collector roles removed: Data Operator's
-- register/fetch-case job is being replaced by victim self-registration
-- (Aadhaar-keyed, auto-generates docket+password, delivered by SMS);
-- District Collector's SLA-escalation-destination job is being dropped
-- entirely (per explicit decision - no replacement authority).
--
-- Existing role grants are REVOKED, not deleted - same soft-delete
-- convention official_roles already uses everywhere else. The roles table
-- rows and its CHECK constraint are deliberately left untouched: real
-- enforcement is at the application layer (routes deleted, requireRole
-- checks removed, no UI offers these roles any more) - tightening the
-- CHECK constraint would fail immediately anyway, since it validates
-- existing rows on ADD, and both role names already exist as live rows.

update official_roles
  set revoked_at = now()
  where role_id in (select role_id from roles where role_name in ('Data Operator', 'District Collector'))
  and revoked_at is null;

-- users.auth_method gains 'self_registered' for the new victim
-- self-registration path. 'data_operator' stays valid too - 35 existing
-- rows already carry it, and nothing can write that value going forward
-- now that the Data Operator module is gone.
alter table users drop constraint victims_auth_method_check;
alter table users add constraint victims_auth_method_check check (auth_method = ANY (ARRAY[
  'district_admin'::text, 'data_operator'::text, 'self_registered'::text
]));
