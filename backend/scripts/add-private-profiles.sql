-- Migration: Add private profile support
-- Run this migration to enable private profiles and follow requests

-- Add profile_visibility column to player_profiles
ALTER TABLE player_profiles
ADD COLUMN IF NOT EXISTS profile_visibility VARCHAR(20) DEFAULT 'everyone';

-- Add profile_visibility column to coach_profiles
ALTER TABLE coach_profiles
ADD COLUMN IF NOT EXISTS profile_visibility VARCHAR(20) DEFAULT 'everyone';

-- Add profile_visibility column to other_profiles
ALTER TABLE other_profiles
ADD COLUMN IF NOT EXISTS profile_visibility VARCHAR(20) DEFAULT 'everyone';

-- Create follow_requests table for pending follow requests on private accounts
CREATE TABLE IF NOT EXISTS follow_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    requester_id UUID REFERENCES users(id) ON DELETE CASCADE,
    target_id UUID REFERENCES users(id) ON DELETE CASCADE,
    status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'accepted', 'declined'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(requester_id, target_id),
    CHECK (requester_id != target_id)
);

-- Indexes for follow_requests
CREATE INDEX IF NOT EXISTS idx_follow_requests_requester ON follow_requests(requester_id);
CREATE INDEX IF NOT EXISTS idx_follow_requests_target ON follow_requests(target_id);
CREATE INDEX IF NOT EXISTS idx_follow_requests_status ON follow_requests(status);

-- Trigger for updated_at on follow_requests
DROP TRIGGER IF EXISTS update_follow_requests_updated_at ON follow_requests;
CREATE TRIGGER update_follow_requests_updated_at
    BEFORE UPDATE ON follow_requests
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

