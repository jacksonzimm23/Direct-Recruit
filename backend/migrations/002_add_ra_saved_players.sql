-- Migration: 002_add_ra_saved_players.sql
-- Date: 2026-04-05
-- Description: Create ra_saved_players table for coach saved/bookmarked players from AI Recruiting Assistant

CREATE TABLE IF NOT EXISTS ra_saved_players (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    coach_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    player_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    saved_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(coach_user_id, player_user_id)
);

CREATE INDEX IF NOT EXISTS idx_ra_saved_coach ON ra_saved_players(coach_user_id);
CREATE INDEX IF NOT EXISTS idx_ra_saved_player ON ra_saved_players(player_user_id);
