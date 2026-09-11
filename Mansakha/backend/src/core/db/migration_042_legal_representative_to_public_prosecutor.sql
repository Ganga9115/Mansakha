-- Renames the migration_040 "Legal Representative" role to "Public
-- Prosecutor" - explicit request, and a real correction: Section 15 of the
-- SC/ST (Prevention of Atrocities) Act, 1989 gives the actual designations
-- for who conducts a case at the Special Court - the State Government
-- "shall specify a Public Prosecutor or appoint... a Special Public
-- Prosecutor" (and, for an Exclusive Special Court, an Exclusive Special
-- Public Prosecutor) - not a NALSA legal-aid panel lawyer, which is what
-- officialDesignations.js's LEGAL_REPRESENTATIVE_DESIGNATIONS had actually
-- been grounded in.
--
-- Disclosed simplification, not corrected here: Section 15 vests this
-- appointment in the STATE GOVERNMENT, not DLSA - this app's own Legal Aid
-- workflow (DLSA reviews a request and assigns this role) is a deliberate
-- product simplification carried over unchanged from migration_040, kept
-- exactly as instructed.
--
-- A simple UPDATE, not a drop+reinsert - official_roles rows reference
-- role_id, never role_name text, so every existing grant of this role
-- (including any already-created account) becomes "Public Prosecutor"
-- automatically with no other row touched. Same reasoning as
-- migration_005/021's own Data Operator rename.
--
-- Three steps, not two - a CHECK is validated against the NEW value on
-- every UPDATE, so neither ordering alone works: widening straight to the
-- final list first fails (a live row still says 'Legal Representative',
-- momentarily disallowed) - updating first fails too (the not-yet-widened
-- constraint doesn't allow 'Public Prosecutor' as a target value yet).
-- Widen to a strict superset, update, then narrow to the real final list.
alter table roles drop constraint if exists roles_role_name_check;
alter table roles add constraint roles_role_name_check
  check (role_name in ('Ministry', 'Administration', 'Counsellor', 'Data Operator',
    'District Welfare Officer', 'Investigating Officer', 'Protection Officer',
    'DLSA Coordinator', 'Special Public Prosecutor', 'District Collector', 'Rehabilitation Officer',
    'Legal Representative', 'Public Prosecutor'));

update roles set role_name = 'Public Prosecutor' where role_name = 'Legal Representative';

alter table roles drop constraint if exists roles_role_name_check;
alter table roles add constraint roles_role_name_check
  check (role_name in ('Ministry', 'Administration', 'Counsellor', 'Data Operator',
    'District Welfare Officer', 'Investigating Officer', 'Protection Officer',
    'DLSA Coordinator', 'Special Public Prosecutor', 'District Collector', 'Rehabilitation Officer',
    'Public Prosecutor'));

-- Note: the pre-existing 'Special Public Prosecutor' role name (retired,
-- absorbed into DLSA Coordinator per migration_028/033's own comments) is a
-- DIFFERENT row from this one and is untouched - this migration only
-- renames the migration_040 role, never resurrects or merges with the old
-- retired one. The two now have confusingly similar names (Public
-- Prosecutor vs. the dormant Special Public Prosecutor) purely because both
-- are grounded in the same real statutory post; only 'Public Prosecutor'
-- (this one) is ever creatable or logs in.
