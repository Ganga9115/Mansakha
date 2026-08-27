-- Mansakha migration 008: Journal title + updated_at (edit/delete support)
--
-- Run ONCE against the live Supabase project (SQL Editor -> New query -> paste
-- -> Run). Same DDL limitation as migrations 002-007.
--
-- Section 1.6 Journal writing was create+list only - no title, no way to
-- edit or delete an entry, and the list was ordered by created_at (so an
-- edited entry wouldn't rise back to the top). Adds the two columns the new
-- PATCH/DELETE /api/victim/journal/:entryId routes need:
--   - title: required going forward (backfilled on any existing rows so the
--     not-null constraint can apply immediately without breaking them).
--   - updated_at: backfilled from created_at (existing rows haven't been
--     "updated" yet, so that's the accurate value), defaulting to now() for
--     everything inserted after this migration. GET /journal now orders by
--     this instead of created_at.
alter table journal_entries add column if not exists title text;
update journal_entries set title = 'Untitled entry' where title is null;
alter table journal_entries alter column title set not null;

alter table journal_entries add column if not exists updated_at timestamptz;
update journal_entries set updated_at = created_at where updated_at is null;
alter table journal_entries alter column updated_at set default now();
alter table journal_entries alter column updated_at set not null;

-- GET /journal now orders by updated_at desc (last-edited first) instead of
-- created_at - the existing index only helped the old ordering.
drop index if exists idx_journal_entries_victim;
create index idx_journal_entries_victim on journal_entries(victim_id, updated_at desc);
