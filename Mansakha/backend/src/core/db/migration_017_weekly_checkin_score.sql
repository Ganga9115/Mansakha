-- Weekly distress score for the 15-question daily check-in flow: once the
-- user has answered 105 questions (15/day x 7 days), the last 7
-- questionnaires' combined responses get one more Ollama-scored
-- distress_scores row - same "no separate weekly table, just another
-- distress_scores row" pattern as the AI-chat word-count trigger
-- (migration_015), reusing the exact same dashboard/trend/alert machinery.
alter table users
  add column if not exists questionnaire_answer_count integer not null default 0;
