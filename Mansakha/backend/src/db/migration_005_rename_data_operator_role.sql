-- Mansakha migration 005: Rename 'Data Intake Admin' role to 'Data Operator'
--
-- Run ONCE against the live Supabase project (SQL Editor -> New query -> paste
-- -> Run). Same DDL limitation as migrations 002-004.
--
-- Explicit user request - the role formerly called 'Data Intake Admin'
-- (Feature Catalog Section 7's "Data Intake & Integration Admin") is
-- renamed 'Data Operator' everywhere: the roles.role_name check constraint
-- has to be widened before the actual row can be updated to the new value.
alter table roles drop constraint if exists roles_role_name_check;

update roles set role_name = 'Data Operator' where role_name = 'Data Intake Admin';

alter table roles add constraint roles_role_name_check
  check (role_name in ('Ministry', 'Administration', 'Counsellor', 'Data Operator'));
