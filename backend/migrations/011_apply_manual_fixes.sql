-- Migration: 011_apply_manual_fixes
-- Date: 2026-04-15
-- Description: Formalize all schema changes from seed-local.js applyManualFixes() into a proper
--              production migration. Adds columns to existing tables, creates new tables for
--              notifications, email changes, password resets, post engagement, game stats, etc.
--              All statements are idempotent (IF NOT EXISTS / IF EXISTS).

-- ============================================================
-- 1. ENUM FIX — add 'other' to user_role if missing
-- ============================================================
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'other'
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'user_role')
  ) THEN
    ALTER TYPE user_role ADD VALUE 'other';
  END IF;
END$$;

-- ============================================================
-- 2. USERS TABLE — add username
-- ============================================================
ALTER TABLE users ADD COLUMN IF NOT EXISTS username VARCHAR(50) UNIQUE;

-- ============================================================
-- 3. PLAYER_PROFILES — add columns
-- ============================================================
ALTER TABLE player_profiles ADD COLUMN IF NOT EXISTS college_division VARCHAR(50);
ALTER TABLE player_profiles ADD COLUMN IF NOT EXISTS transfer VARCHAR(10);
ALTER TABLE player_profiles ADD COLUMN IF NOT EXISTS eligibility INTEGER;
ALTER TABLE player_profiles ADD COLUMN IF NOT EXISTS number VARCHAR(10);
ALTER TABLE player_profiles ADD COLUMN IF NOT EXISTS conference VARCHAR(100);
ALTER TABLE player_profiles ADD COLUMN IF NOT EXISTS offers TEXT;
ALTER TABLE player_profiles ADD COLUMN IF NOT EXISTS star_rating INTEGER;
ALTER TABLE player_profiles ADD COLUMN IF NOT EXISTS followers_count INTEGER DEFAULT 0;
ALTER TABLE player_profiles ADD COLUMN IF NOT EXISTS following_count INTEGER DEFAULT 0;
ALTER TABLE player_profiles ADD COLUMN IF NOT EXISTS message_permissions VARCHAR(20) DEFAULT 'everyone';
ALTER TABLE player_profiles ADD COLUMN IF NOT EXISTS lastseasonstat1 VARCHAR(50);
ALTER TABLE player_profiles ADD COLUMN IF NOT EXISTS lastseasonstat2 VARCHAR(50);
ALTER TABLE player_profiles ADD COLUMN IF NOT EXISTS lastseasonstat3 VARCHAR(50);
ALTER TABLE player_profiles ADD COLUMN IF NOT EXISTS careerstat1 VARCHAR(50);
ALTER TABLE player_profiles ADD COLUMN IF NOT EXISTS careerstat2 VARCHAR(50);
ALTER TABLE player_profiles ADD COLUMN IF NOT EXISTS careerstat3 VARCHAR(50);
ALTER TABLE player_profiles ADD COLUMN IF NOT EXISTS cc_views INTEGER DEFAULT 0;

-- ============================================================
-- 4. COACH_PROFILES — add columns
-- ============================================================
ALTER TABLE coach_profiles ADD COLUMN IF NOT EXISTS followers_count INTEGER DEFAULT 0;
ALTER TABLE coach_profiles ADD COLUMN IF NOT EXISTS following_count INTEGER DEFAULT 0;
ALTER TABLE coach_profiles ADD COLUMN IF NOT EXISTS message_permissions VARCHAR(20) DEFAULT 'everyone';

-- ============================================================
-- 5. OTHER_PROFILES — create table
-- ============================================================
CREATE TABLE IF NOT EXISTS other_profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    subheader VARCHAR(255),
    bio TEXT,
    profile_image_url TEXT,
    profile_picture_url TEXT,
    username VARCHAR(50) UNIQUE,
    followers_count INTEGER DEFAULT 0,
    following_count INTEGER DEFAULT 0,
    profile_visibility VARCHAR(20) DEFAULT 'everyone',
    message_permissions VARCHAR(20) DEFAULT 'everyone',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE other_profiles ADD COLUMN IF NOT EXISTS profile_picture_url TEXT;
ALTER TABLE other_profiles ADD COLUMN IF NOT EXISTS message_permissions VARCHAR(20) DEFAULT 'everyone';

-- ============================================================
-- 6. POSTS — add columns
-- ============================================================
ALTER TABLE posts ADD COLUMN IF NOT EXISTS media_urls TEXT[];
ALTER TABLE posts ADD COLUMN IF NOT EXISTS visibility VARCHAR(20) DEFAULT 'public';
ALTER TABLE posts ADD COLUMN IF NOT EXISTS shares_count INTEGER DEFAULT 0;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS saves_count INTEGER DEFAULT 0;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN DEFAULT false;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT false;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS engagement_score NUMERIC DEFAULT 0;

-- ============================================================
-- 7. POST_COMMENTS — add columns
-- ============================================================
ALTER TABLE post_comments ADD COLUMN IF NOT EXISTS parent_comment_id UUID REFERENCES post_comments(id) ON DELETE CASCADE;
ALTER TABLE post_comments ADD COLUMN IF NOT EXISTS likes_count INTEGER DEFAULT 0;
ALTER TABLE post_comments ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT false;

-- ============================================================
-- 8. RECRUITING_BOARDS — add columns
-- ============================================================
ALTER TABLE recruiting_boards ADD COLUMN IF NOT EXISTS owner_user_id UUID REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE recruiting_boards ADD COLUMN IF NOT EXISTS is_personal BOOLEAN DEFAULT false;
ALTER TABLE recruiting_boards ADD COLUMN IF NOT EXISTS board_name VARCHAR(255);
ALTER TABLE recruiting_boards ADD COLUMN IF NOT EXISTS players JSONB DEFAULT '[]'::jsonb;
ALTER TABLE recruiting_boards ADD COLUMN IF NOT EXISTS collab JSONB DEFAULT '[]'::jsonb;

-- ============================================================
-- 9. NOTIFICATIONS — create table
-- ============================================================
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    related_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    related_entity_id UUID,
    related_entity_type VARCHAR(50),
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- 10. PENDING_EMAIL_CHANGES — create table
-- ============================================================
CREATE TABLE IF NOT EXISTS pending_email_changes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    current_email VARCHAR(255) NOT NULL,
    new_email VARCHAR(255) NOT NULL,
    verification_code VARCHAR(10) NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    resend_count INTEGER DEFAULT 0,
    last_resend_at TIMESTAMP,
    cooldown_until TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- 11. PENDING_PASSWORD_RESETS — create table
-- ============================================================
CREATE TABLE IF NOT EXISTS pending_password_resets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    verification_code VARCHAR(10) NOT NULL,
    verified BOOLEAN DEFAULT false,
    expires_at TIMESTAMP NOT NULL,
    resend_count INTEGER DEFAULT 0,
    last_resend_at TIMESTAMP,
    cooldown_until TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- 12. POST_SAVES — create table
-- ============================================================
CREATE TABLE IF NOT EXISTS post_saves (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(post_id, user_id)
);

-- ============================================================
-- 13. COMMENT_LIKES — create table
-- ============================================================
CREATE TABLE IF NOT EXISTS comment_likes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    comment_id UUID NOT NULL REFERENCES post_comments(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(comment_id, user_id)
);

-- ============================================================
-- 14. POST_SHARES — create table
-- ============================================================
CREATE TABLE IF NOT EXISTS post_shares (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    original_post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    share_type VARCHAR(20) NOT NULL DEFAULT 'repost',
    quote_content TEXT,
    media_urls TEXT[],
    media_type VARCHAR(10),
    likes_count INTEGER DEFAULT 0,
    comments_count INTEGER DEFAULT 0,
    shares_count INTEGER DEFAULT 0,
    saves_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- 15. SHARE_LIKES — create table
-- ============================================================
CREATE TABLE IF NOT EXISTS share_likes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    share_id UUID NOT NULL REFERENCES post_shares(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(share_id, user_id)
);

-- ============================================================
-- 16. SHARE_COMMENTS — create table
-- ============================================================
CREATE TABLE IF NOT EXISTS share_comments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    share_id UUID NOT NULL REFERENCES post_shares(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    parent_comment_id UUID,
    likes_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- 17. SHARE_SAVES — create table
-- ============================================================
CREATE TABLE IF NOT EXISTS share_saves (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    share_id UUID NOT NULL REFERENCES post_shares(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(share_id, user_id)
);

-- ============================================================
-- 18. SHARE_COMMENT_LIKES — create table
-- ============================================================
CREATE TABLE IF NOT EXISTS share_comment_likes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    comment_id UUID NOT NULL REFERENCES share_comments(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(comment_id, user_id)
);

-- ============================================================
-- 19. PROFILE_VIEWS — create table (if not already created + renamed by 010)
-- ============================================================
-- Migration 010 renames viewed_player_id → viewed_user_id. If 010 already ran,
-- the table exists with the new column name, so CREATE TABLE is a no-op.
-- Use viewed_user_id (the post-010 name) for the CREATE TABLE definition.
CREATE TABLE IF NOT EXISTS profile_views (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    viewed_user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    viewer_id UUID REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_profile_views_viewed_user ON profile_views(viewed_user_id);
CREATE INDEX IF NOT EXISTS idx_profile_views_viewer ON profile_views(viewer_id);
CREATE INDEX IF NOT EXISTS idx_profile_views_created_at ON profile_views(created_at DESC);

-- ============================================================
-- 20. PLAYER_GAMES — create table
-- ============================================================
CREATE TABLE IF NOT EXISTS player_games (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    player_id UUID NOT NULL REFERENCES player_profiles(id) ON DELETE CASCADE,
    game_date DATE,
    season_year INTEGER,
    opponent VARCHAR(255),
    result VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- 21. PLAYER_GAME_STATS — create table
-- ============================================================
CREATE TABLE IF NOT EXISTS player_game_stats (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    game_id UUID NOT NULL REFERENCES player_games(id) ON DELETE CASCADE,
    position VARCHAR(50) NOT NULL,
    stats JSONB,
    player_name VARCHAR(255),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
