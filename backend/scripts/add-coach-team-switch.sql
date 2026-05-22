-- Local dev mirror of backend/migrations/040_add_coach_team_switch.sql
-- (see that file for full context). Idempotent via IF NOT EXISTS.

ALTER TABLE coach_signup_requests ADD COLUMN IF NOT EXISTS is_team_switch BOOLEAN DEFAULT false;
ALTER TABLE coach_invites          ADD COLUMN IF NOT EXISTS is_team_switch BOOLEAN DEFAULT false;

ALTER TABLE coach_signup_requests ADD COLUMN IF NOT EXISTS old_team_name VARCHAR(200);
ALTER TABLE coach_signup_requests ADD COLUMN IF NOT EXISTS old_division  VARCHAR(20);
ALTER TABLE coach_signup_requests ADD COLUMN IF NOT EXISTS old_state     VARCHAR(50);
ALTER TABLE coach_signup_requests ADD COLUMN IF NOT EXISTS state         VARCHAR(50);

CREATE TABLE IF NOT EXISTS coach_team_switch_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    from_team_name VARCHAR(200),
    from_division  VARCHAR(20),
    to_team_name   VARCHAR(200),
    to_division    VARCHAR(20),
    invite_token   VARCHAR(64),
    switched_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_team_switch_history_user
    ON coach_team_switch_history(user_id, switched_at DESC);
