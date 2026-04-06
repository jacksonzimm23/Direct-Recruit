-- Add ai_engagement_events table for tracking coach engagement after AI search results

CREATE TABLE IF NOT EXISTS ai_engagement_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    analytics_id UUID REFERENCES ai_analytics(id) ON DELETE SET NULL,
    ai_type VARCHAR(30) NOT NULL,
    event_type VARCHAR(30) NOT NULL,
    coach_division VARCHAR(50),
    player_user_id UUID NOT NULL,
    player_position VARCHAR(100),
    player_state VARCHAR(50)
);

CREATE INDEX IF NOT EXISTS idx_ai_engagement_created ON ai_engagement_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_engagement_type ON ai_engagement_events(event_type);
CREATE INDEX IF NOT EXISTS idx_ai_engagement_analytics ON ai_engagement_events(analytics_id);
