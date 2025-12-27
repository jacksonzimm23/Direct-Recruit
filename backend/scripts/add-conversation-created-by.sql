-- Migration: Add created_by column to conversations table
-- This column tracks who initiated the conversation so empty conversations
-- only appear for the person who started them

-- Add the created_by column
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id) ON DELETE SET NULL;

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_conversations_created_by ON conversations(created_by);

-- For existing conversations, set created_by to the first participant
-- (This is a best-effort migration for existing data)
UPDATE conversations c
SET created_by = (
    SELECT user_id
    FROM conversation_participants cp
    WHERE cp.conversation_id = c.id
    ORDER BY cp.joined_at ASC
    LIMIT 1
)
WHERE c.created_by IS NULL;
