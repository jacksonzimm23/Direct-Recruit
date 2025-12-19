-- Migration: Add recruiting_boards table for coach board configurations

CREATE TABLE IF NOT EXISTS recruiting_boards (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    coach_user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    class_year INTEGER NOT NULL,
    offense_positions JSONB NOT NULL,
    defense_positions JSONB NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(coach_user_id, class_year)
);

-- Index for faster lookups by coach
CREATE INDEX IF NOT EXISTS idx_recruiting_boards_coach ON recruiting_boards(coach_user_id);

-- Index for lookups by class year
CREATE INDEX IF NOT EXISTS idx_recruiting_boards_class_year ON recruiting_boards(class_year);

-- Trigger for updated_at
DROP TRIGGER IF EXISTS update_recruiting_boards_updated_at ON recruiting_boards;
CREATE TRIGGER update_recruiting_boards_updated_at
    BEFORE UPDATE ON recruiting_boards
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
