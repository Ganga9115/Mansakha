-- Adds read-tracking to the existing 1:1 user<->counsellor `messages` thread
-- (unread-dot indicators) and a small ephemeral typing-status table (typing
-- indicators), per explicit request.
begin;

alter table messages add column if not exists read_at timestamptz;

-- One row per (user_id, official_id, sender_type) - upserted on every typing
-- ping, polled by the OTHER party alongside messages. Deliberately no
-- history kept (an old row is just overwritten) - this is ephemeral UI
-- state, not something worth an audit trail.
create table if not exists typing_status (
  user_id      uuid not null references users(user_id),
  official_id  uuid not null references officials(official_id),
  sender_type  text not null check (sender_type in ('user', 'official')),
  updated_at   timestamptz not null default now(),
  primary key (user_id, official_id, sender_type)
);

commit;
