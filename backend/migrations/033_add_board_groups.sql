-- 033_add_board_groups.sql
-- Phase 2 of the recruiting-board redesign: Google-Docs-style group sharing.
-- Adds two new tables (board_groups, board_group_members) and a group_id
-- column on recruiting_boards so each shared board lives inside a group.
-- Wipes legacy single-board shared rows in the same migration since the
-- pre-Phase-2 shared system is being retired entirely.

CREATE TABLE IF NOT EXISTS board_groups (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    group_name VARCHAR(100) NOT NULL,
    owner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS board_group_members (
    group_id UUID NOT NULL REFERENCES board_groups(id) ON DELETE CASCADE,
    user_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    permission VARCHAR(10) NOT NULL CHECK (permission IN ('viewer', 'editor')),
    added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (group_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_board_group_members_user ON board_group_members(user_id);

ALTER TABLE recruiting_boards ADD COLUMN IF NOT EXISTS group_id UUID REFERENCES board_groups(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_recruiting_boards_group ON recruiting_boards(group_id);

-- Wipe legacy shared boards. PROD CHECK before running: SELECT COUNT(*)
-- FROM recruiting_boards WHERE is_personal = FALSE AND group_id IS NULL.
-- If non-zero in prod, pause and migrate by hand before applying this.
DELETE FROM recruiting_boards WHERE is_personal = FALSE AND group_id IS NULL;
