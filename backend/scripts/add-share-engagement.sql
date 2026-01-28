-- Migration: Add independent engagement tracking for quote reposts
-- This allows quote posts to have their own likes, comments, and shares separate from the original post

-- Add engagement count columns to post_shares table
ALTER TABLE post_shares ADD COLUMN IF NOT EXISTS likes_count INTEGER DEFAULT 0;
ALTER TABLE post_shares ADD COLUMN IF NOT EXISTS comments_count INTEGER DEFAULT 0;
ALTER TABLE post_shares ADD COLUMN IF NOT EXISTS shares_count INTEGER DEFAULT 0;
ALTER TABLE post_shares ADD COLUMN IF NOT EXISTS saves_count INTEGER DEFAULT 0;

-- Add media columns to post_shares table for quote post media
ALTER TABLE post_shares ADD COLUMN IF NOT EXISTS media_urls TEXT[];
ALTER TABLE post_shares ADD COLUMN IF NOT EXISTS media_type VARCHAR(10);

-- Create share_likes table for likes on quote posts
CREATE TABLE IF NOT EXISTS share_likes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    share_id UUID REFERENCES post_shares(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(share_id, user_id)
);

-- Create share_comments table for comments on quote posts
CREATE TABLE IF NOT EXISTS share_comments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    share_id UUID REFERENCES post_shares(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    parent_comment_id UUID REFERENCES share_comments(id) ON DELETE CASCADE,
    likes_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create share_saves table for saves on quote posts
CREATE TABLE IF NOT EXISTS share_saves (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    share_id UUID REFERENCES post_shares(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(share_id, user_id)
);

-- Create share_comment_likes table for likes on share comments
CREATE TABLE IF NOT EXISTS share_comment_likes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    comment_id UUID REFERENCES share_comments(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(comment_id, user_id)
);

-- Indexes for share_likes
CREATE INDEX IF NOT EXISTS idx_share_likes_share_id ON share_likes(share_id);
CREATE INDEX IF NOT EXISTS idx_share_likes_user_id ON share_likes(user_id);

-- Indexes for share_comments
CREATE INDEX IF NOT EXISTS idx_share_comments_share_id ON share_comments(share_id);
CREATE INDEX IF NOT EXISTS idx_share_comments_user_id ON share_comments(user_id);
CREATE INDEX IF NOT EXISTS idx_share_comments_parent ON share_comments(parent_comment_id);

-- Indexes for share_saves
CREATE INDEX IF NOT EXISTS idx_share_saves_share_id ON share_saves(share_id);
CREATE INDEX IF NOT EXISTS idx_share_saves_user_id ON share_saves(user_id);

-- Indexes for share_comment_likes
CREATE INDEX IF NOT EXISTS idx_share_comment_likes_comment_id ON share_comment_likes(comment_id);
CREATE INDEX IF NOT EXISTS idx_share_comment_likes_user_id ON share_comment_likes(user_id);

-- Trigger for share_comments updated_at
DROP TRIGGER IF EXISTS update_share_comments_updated_at ON share_comments;
CREATE TRIGGER update_share_comments_updated_at
    BEFORE UPDATE ON share_comments
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
