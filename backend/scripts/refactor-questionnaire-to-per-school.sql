-- refactor-questionnaire-to-per-school.sql
-- Local dev twin of backend/migrations/035_refactor_questionnaire_to_per_school.sql.
-- See that file for full rationale.

ALTER TABLE team_questionnaires
    ADD COLUMN IF NOT EXISTS school_key VARCHAR(255);

UPDATE team_questionnaires tq
   SET school_key = LOWER(TRIM(cp.team_name))
  FROM board_groups bg
  JOIN coach_profiles cp ON cp.user_id = bg.owner_user_id
 WHERE tq.group_id = bg.id
   AND tq.school_key IS NULL
   AND cp.team_name IS NOT NULL
   AND TRIM(cp.team_name) <> '';

UPDATE team_questionnaires
   SET school_key = '__orphan__' || id::text
 WHERE school_key IS NULL;

ALTER TABLE team_questionnaires
    DROP CONSTRAINT IF EXISTS team_questionnaires_group_id_key;

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

ALTER TABLE team_questionnaires
    DROP COLUMN IF EXISTS group_id;

CREATE INDEX IF NOT EXISTS idx_team_questionnaires_school_key
    ON team_questionnaires(school_key);
