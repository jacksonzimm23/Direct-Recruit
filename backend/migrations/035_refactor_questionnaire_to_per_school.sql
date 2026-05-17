-- 035_refactor_questionnaire_to_per_school.sql
-- Refactor: team_questionnaires is now keyed by SCHOOL, not by shared group.
-- Rationale: A school's questionnaire link is permanent and belongs to the
-- school identity. When a coach changes their team_name, they get a different
-- school's questionnaire automatically; the old school's questionnaire keeps
-- serving the remaining coaches at that school. See pipeline.md.

-- Step 1: add nullable school_key column.
ALTER TABLE team_questionnaires
    ADD COLUMN IF NOT EXISTS school_key VARCHAR(255);

-- Step 2: backfill school_key from the group owner's current team_name.
-- Each existing row has a group_id pointing at board_groups.owner_user_id,
-- which has a coach_profiles row with team_name. Lowercased + trimmed for
-- consistent matching going forward.
UPDATE team_questionnaires tq
   SET school_key = LOWER(TRIM(cp.team_name))
  FROM board_groups bg
  JOIN coach_profiles cp ON cp.user_id = bg.owner_user_id
 WHERE tq.group_id = bg.id
   AND tq.school_key IS NULL
   AND cp.team_name IS NOT NULL
   AND TRIM(cp.team_name) <> '';

-- Defensive: if any row still has NULL school_key (orphaned group, missing
-- owner team_name), set it to a unique placeholder so we can NOT NULL the column.
-- These rows are effectively dead questionnaires that can never resolve again.
UPDATE team_questionnaires
   SET school_key = '__orphan__' || id::text
 WHERE school_key IS NULL;

-- Step 3: drop the old UNIQUE constraint on group_id.
ALTER TABLE team_questionnaires
    DROP CONSTRAINT IF EXISTS team_questionnaires_group_id_key;

-- Step 4: NOT NULL + UNIQUE on school_key.
ALTER TABLE team_questionnaires
    ALTER COLUMN school_key SET NOT NULL;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conname = 'team_questionnaires_school_key_key'
    ) THEN
        ALTER TABLE team_questionnaires
            ADD CONSTRAINT team_questionnaires_school_key_key UNIQUE (school_key);
    END IF;
END $$;

-- Step 5: drop the group_id column entirely. Questionnaires no longer belong
-- to groups.
ALTER TABLE team_questionnaires
    DROP COLUMN IF EXISTS group_id;

-- Step 6: helpful index for case-insensitive lookups by school_key.
CREATE INDEX IF NOT EXISTS idx_team_questionnaires_school_key
    ON team_questionnaires(school_key);
