-- Renames the 'data_intake_admin' auth_method value to 'data_operator',
-- matching the rest of the app's naming (role_name is already 'Data
-- Operator', the web-frontend folder/routes are already dataoperator/
-- /dataoperator) - auth_method was the one place still using the old
-- "Data Intake Admin" naming this app used before that rename.
begin;

alter table users drop constraint victims_auth_method_check;
update users set auth_method = 'data_operator' where auth_method = 'data_intake_admin';
alter table users add constraint victims_auth_method_check
  check (auth_method in ('district_admin', 'data_operator'));

commit;
