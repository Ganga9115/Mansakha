-- chat_messages so far only ever recorded plain typed chat (ChatScreen.js's
-- composer, via POST /api/user/chat/log) - MansakhaCallModal.js's live
-- voice-call and video-call turns already POST to the same /chat/log route
-- (see its logChatTurn.mutate calls), so their transcript text was already
-- landing in this table too, just indistinguishable from typed text. Adding
-- `channel` lets the backend (and any future counsellor/admin view) tell
-- the three apart, without needing three separate tables for what's
-- otherwise identical user<->AI turn data.
begin;

alter table chat_messages
  add column if not exists channel text not null default 'text';

alter table chat_messages
  drop constraint if exists chat_messages_channel_check;

alter table chat_messages
  add constraint chat_messages_channel_check check (channel in ('text', 'voice_call', 'video_call'));

commit;
