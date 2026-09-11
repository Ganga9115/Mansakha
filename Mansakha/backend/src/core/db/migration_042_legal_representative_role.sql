-- Legal Representative: migration_040 already defined this role and wrote
-- `insert into roles (role_name) values ('Legal Representative')`, but that
-- insert never actually landed against the live shared database - the
-- constraint below (confirmed live via pg_get_constraintdef) never admitted
-- it, so the role_id could never exist, so no official could ever hold it,
-- so legalRepresentative.routes.js's own requireRole(['Legal
-- Representative']) has been unreachable dead code since day one. A live,
-- concurrent 'Public Prosecutor' addition (from a migration run against a
-- base schema predating migration_040) is what's actually in the
-- constraint today instead - this migration only ADDS 'Legal
-- Representative' back in, it does not touch or remove that or anything
-- else already there.
--
-- Same drop-and-recreate-the-named-constraint pattern migration_040 itself
-- used for this exact constraint (Postgres has no ALTER CHECK to widen an
-- existing one in place).
alter table roles drop constraint if exists roles_role_name_check;
alter table roles add constraint roles_role_name_check
  check (role_name in ('Ministry', 'Administration', 'Counsellor', 'Data Operator',
    'District Welfare Officer', 'Investigating Officer', 'Protection Officer',
    'DLSA Coordinator', 'Special Public Prosecutor', 'Public Prosecutor',
    'District Collector', 'Rehabilitation Officer', 'Legal Representative'));

insert into roles (role_name) values ('Legal Representative') on conflict (role_name) do nothing;
