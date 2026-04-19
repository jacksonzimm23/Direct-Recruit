-- Phase 4c-I: track per-device push tokens so the backend can fan out
-- Apple Push Notifications (APNs) to every device a user has signed in on.
-- One user can have multiple devices (iPhone + iPad + future Android).

CREATE TABLE IF NOT EXISTS device_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token TEXT NOT NULL,
    platform VARCHAR(20) NOT NULL,
    environment VARCHAR(20) NOT NULL DEFAULT 'production',
    app_version VARCHAR(20),
    os_version VARCHAR(20),
    last_seen_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, token, platform)
);

CREATE INDEX IF NOT EXISTS idx_device_tokens_user_id ON device_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_device_tokens_platform ON device_tokens(platform);
CREATE INDEX IF NOT EXISTS idx_device_tokens_last_seen ON device_tokens(last_seen_at DESC);
