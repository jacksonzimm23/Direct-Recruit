-- add-board-groups.sql
-- Phase 2: Google-Docs-style group sharing for recruiting boards.
-- A "group" is a named collection of college coaches. Each member has either
-- 'viewer' or 'editor' permission. Inside a group, members collectively manage
-- up to 5 named recruiting boards (rows in recruiting_boards with group_id set).
--
-- Notes:
--   - The owner is also stored as an 'editor' row in board_group_members so a
--     single WHERE user_id = $X yields every group the coach can see.
--     Application code enforces "only the owner may transfer / delete-group /
--     change owner permission".
--   - The legacy single-board shared system is being retired in this phase;
--     pre-Phase-2 shared rows are wiped at the bottom. Local dev has none, so
--     this is a safe no-op locally.

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

-- One-time wipe of legacy (pre-Phase-2) shared boards. Personal boards are
-- untouched. Group boards (added later by Phase 2 code) are also untouched
-- because they have group_id IS NOT NULL.
DELETE FROM recruiting_boards WHERE is_personal = FALSE AND group_id IS NULL;
