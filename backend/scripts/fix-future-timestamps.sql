-- Fix posts with timestamps in the future
-- This script adjusts posts that were created when the system clock was ahead

-- First, let's see what posts have future timestamps
SELECT id, user_id, content, created_at,
       created_at - NOW() as time_ahead
FROM posts
WHERE created_at > NOW()
ORDER BY created_at DESC;

-- Update all posts with future timestamps to be set to NOW()
-- This will make them show as "Just now" initially, then age normally
UPDATE posts
SET created_at = NOW(),
    updated_at = NOW()
WHERE created_at > NOW();

-- Also fix any comments with future timestamps
UPDATE post_comments
SET created_at = NOW(),
    updated_at = NOW()
WHERE created_at > NOW();

-- Fix any messages with future timestamps
UPDATE messages
SET created_at = NOW()
WHERE created_at > NOW();

-- Fix any conversations with future timestamps
UPDATE conversations
SET created_at = NOW(),
    updated_at = NOW()
WHERE created_at > NOW();

-- Verify the fix - should return 0 rows
SELECT COUNT(*) as future_posts FROM posts WHERE created_at > NOW();
SELECT COUNT(*) as future_comments FROM post_comments WHERE created_at > NOW();
SELECT COUNT(*) as future_messages FROM messages WHERE created_at > NOW();
