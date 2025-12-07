-- Add optimized indexes for messages system
-- Run this in your PostgreSQL database

-- Index for faster message queries by conversation (already exists but adding composite)
CREATE INDEX IF NOT EXISTS idx_messages_conversation_created
ON messages(conversation_id, created_at DESC);

-- Index for finding unread messages efficiently
CREATE INDEX IF NOT EXISTS idx_messages_unread
ON messages(conversation_id, sender_id, read)
WHERE read = false;

-- Index for sender lookups
CREATE INDEX IF NOT EXISTS idx_messages_sender
ON messages(sender_id);

-- Index for conversation participants lookup
CREATE INDEX IF NOT EXISTS idx_conversation_participants_user
ON conversation_participants(user_id);

-- Index for conversation participants by conversation
CREATE INDEX IF NOT EXISTS idx_conversation_participants_conversation
ON conversation_participants(conversation_id);

-- Verify indexes were created
SELECT indexname, tablename
FROM pg_indexes
WHERE tablename IN ('messages', 'conversations', 'conversation_participants')
ORDER BY tablename, indexname;
