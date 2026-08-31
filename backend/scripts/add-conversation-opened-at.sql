-- add-conversation-opened-at.sql (local dev twin of migrations/055_add_conversation_opened_at.sql)
-- conversation_participants.opened_at - per-user "I opened this thread" marker.
--
-- Why: a conversation with zero messages was only ever listed for c.created_by
-- (see Message.getUserConversations). If person A opened a thread from person B's
-- profile and never typed anything, then B later clicked "Message" on A's profile,
-- getOrCreateConversation returned A's existing row - and B's own conversation list
-- filtered it straight back out. The frontend builds the thread header from that
-- list (selectConversation -> conversations.find -> updateThreadHeader), so B got a
-- thread with a blank avatar, no name and no subheader.
--
-- created_by stays as-is: it still keeps a one-sided empty conversation out of the
-- recipient's inbox until they open it themselves. opened_at records the moment
-- they do, which is the per-user fact created_by could never express.

ALTER TABLE conversation_participants
  ADD COLUMN IF NOT EXISTS opened_at TIMESTAMP DEFAULT NULL;
