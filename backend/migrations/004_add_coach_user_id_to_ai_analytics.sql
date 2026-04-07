-- Migration: Add coach_user_id to ai_analytics for per-coach token usage tracking
-- Date: 2026-04-06
-- Description: Enables per-coach token usage aggregation for subscription tier enforcement

ALTER TABLE ai_analytics ADD COLUMN IF NOT EXISTS coach_user_id UUID REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_ai_analytics_coach_user ON ai_analytics(coach_user_id);
