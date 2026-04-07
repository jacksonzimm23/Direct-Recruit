-- Profile switching support: history tracking + cooldown column

-- Track profile type switch history
CREATE TABLE IF NOT EXISTS profile_switch_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    from_role VARCHAR(20) NOT NULL,
    from_subtype VARCHAR(30) NOT NULL,
    to_role VARCHAR(20) NOT NULL,
    to_subtype VARCHAR(30) NOT NULL,
    switched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_profile_switch_history_user ON profile_switch_history(user_id);

-- Cooldown tracking on users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_profile_switch_at TIMESTAMP;
