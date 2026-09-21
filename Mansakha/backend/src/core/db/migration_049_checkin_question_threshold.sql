-- New first-time-scoring gate for check-ins: distress prediction should not
-- run at all until a user has answered a cumulative 105 questions across
-- their check-ins (~7 check-ins at 15 questions each) - same running-counter
-- pattern as chat_word_count (migration_015_chat_scoring_and_disengagement.sql),
-- incremented by /checkin on every submission and never reset (unlike the
-- chat counter, which resets after each scoring pass - this one only ever
-- needs to cross its threshold once). Existing users start at 0, same as
-- everyone else - no backfill from check-in history.
begin;

alter table users
  add column if not exists checkin_question_count integer not null default 0;

commit;
