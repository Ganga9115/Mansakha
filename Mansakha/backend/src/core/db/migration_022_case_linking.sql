-- Multi-Case-Per-Person Support: a person can have more than one legal case
-- (docket number), each on its own `users` row. `linked_to_user_id` marks a
-- row as a "dependent" case whose identity/session/counsellor resolve
-- through the row it points to (the "anchor") - flat, 2-level only (enforced
-- in application code, not here), matching this schema's existing
-- self-referencing precedent (jurisdictions.parent_id, officials.provisioned_by).
--
-- aadhaar_number becomes the primary key Data Operator uses to recognize two
-- docket numbers belong to the same person. UNIQUE (not just an index) is
-- safe because only an anchor case ever gets its own user_identity row - a
-- dependent case inherits the anchor's identity and gets none of its own -
-- so one real person's Aadhaar naturally exists exactly once in this table.
begin;

alter table users add column if not exists linked_to_user_id uuid references users(user_id);
create index if not exists idx_users_linked_to on users(linked_to_user_id);
alter table user_identity add column if not exists aadhaar_number text unique;

commit;
