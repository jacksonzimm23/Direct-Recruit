-- Migration: 001_add_ai_analytics.sql
-- Date: 2026-04-05
-- Description: Create ai_analytics table for tracking AI search requests and results

CREATE TABLE IF NOT EXISTS ai_analytics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ai_type VARCHAR(30) NOT NULL,
    coach_division VARCHAR(50),
    coach_state VARCHAR(50),
    raw_query TEXT NOT NULL,
    filters_json JSONB,
    active_filters TEXT[],
    result_count INTEGER DEFAULT 0,
    has_more BOOLEAN DEFAULT false,
    avg_relevance_score DECIMAL(8,2),
    result_players JSONB,
    model_version VARCHAR(50),
    input_tokens INTEGER,
    output_tokens INTEGER,
    latency_ms INTEGER
);

CREATE INDEX IF NOT EXISTS idx_ai_analytics_type ON ai_analytics(ai_type);
CREATE INDEX IF NOT EXISTS idx_ai_analytics_created ON ai_analytics(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_analytics_division ON ai_analytics(coach_division);
