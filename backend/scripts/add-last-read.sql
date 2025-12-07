-- Add last_read_at column to conversation_participants to track when user last read the conversation
ALTER TABLE conversation_participants
ADD COLUMN IF NOT EXISTS last_read_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;

-- Update existing rows to have current timestamp (so existing conversations aren't marked as unread)
UPDATE conversation_participants SET last_read_at = CURRENT_TIMESTAMP WHERE last_read_at IS NULL;
