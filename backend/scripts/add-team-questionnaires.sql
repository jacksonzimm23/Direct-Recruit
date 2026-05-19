-- add-team-questionnaires.sql
-- Local dev twin of backend/migrations/034_add_team_questionnaires.sql.
-- Foundation tables for the Recruiting Pipeline feature (Plan 1 in pipeline.md).

CREATE TABLE IF NOT EXISTS team_questionnaires (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    group_id UUID NOT NULL UNIQUE REFERENCES board_groups(id) ON DELETE CASCADE,
    slug VARCHAR(64) NOT NULL UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_team_questionnaires_slug ON team_questionnaires(slug);

CREATE TABLE IF NOT EXISTS questionnaire_submissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    questionnaire_id UUID NOT NULL REFERENCES team_questionnaires(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    submission_data JSONB NOT NULL,
    linked_player_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_questionnaire_submissions_questionnaire_email
    ON questionnaire_submissions(questionnaire_id, LOWER(email));

CREATE INDEX IF NOT EXISTS idx_questionnaire_submissions_linked_user
    ON questionnaire_submissions(linked_player_user_id)
    WHERE linked_player_user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS pool_entries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    questionnaire_id UUID NOT NULL REFERENCES team_questionnaires(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    latest_submission_id UUID NOT NULL REFERENCES questionnaire_submissions(id) ON DELETE CASCADE,
    submission_count INT NOT NULL DEFAULT 1,
    linked_player_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    first_submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_pool_entries_questionnaire_email
    ON pool_entries(questionnaire_id, LOWER(email));

CREATE INDEX IF NOT EXISTS idx_pool_entries_recency
    ON pool_entries(questionnaire_id, last_submitted_at DESC);

CREATE INDEX IF NOT EXISTS idx_pool_entries_linked_user
    ON pool_entries(linked_player_user_id)
    WHERE linked_player_user_id IS NOT NULL;
