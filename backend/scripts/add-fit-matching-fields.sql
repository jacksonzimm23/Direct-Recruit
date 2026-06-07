-- add-fit-matching-fields.sql
-- Local-dev twin of backend/migrations/046_add_fit_matching_fields.sql.
-- See that file for full rationale (AI Fit-Matching feature, Plan 1 / match.md).
-- Identical SQL body; idempotent via IF NOT EXISTS.

-- ── player_profiles (hsplayer + collegeplayer + transferplayer; all role='player') ──
ALTER TABLE player_profiles
  ADD COLUMN IF NOT EXISTS weighted_gpa             NUMERIC(4,2),
  ADD COLUMN IF NOT EXISTS has_ap_ib                BOOLEAN,
  ADD COLUMN IF NOT EXISTS ap_ib_count              INTEGER,
  ADD COLUMN IF NOT EXISTS class_rank               VARCHAR(50),
  ADD COLUMN IF NOT EXISTS intended_major           TEXT[],
  ADD COLUMN IF NOT EXISTS home_zip                 VARCHAR(5),
  ADD COLUMN IF NOT EXISTS needs_financial_aid      VARCHAR(10),
  ADD COLUMN IF NOT EXISTS needs_scholarship        VARCHAR(10),
  ADD COLUMN IF NOT EXISTS pell_or_first_gen        BOOLEAN,
  ADD COLUMN IF NOT EXISTS levels_open              TEXT[],
  ADD COLUMN IF NOT EXISTS preferred_regions        TEXT[],
  ADD COLUMN IF NOT EXISTS preferred_campus_setting VARCHAR(20),
  ADD COLUMN IF NOT EXISTS fit_preferences          JSONB NOT NULL DEFAULT '{}'::JSONB;

-- ── coach_profiles (collegecoach program profile) ──
ALTER TABLE coach_profiles
  ADD COLUMN IF NOT EXISTS admitted_gpa_min         NUMERIC(3,2),
  ADD COLUMN IF NOT EXISTS admitted_gpa_max         NUMERIC(3,2),
  ADD COLUMN IF NOT EXISTS test_optional            BOOLEAN,
  ADD COLUMN IF NOT EXISTS sat_min                  INTEGER,
  ADD COLUMN IF NOT EXISTS sat_max                  INTEGER,
  ADD COLUMN IF NOT EXISTS act_min                  INTEGER,
  ADD COLUMN IF NOT EXISTS act_max                  INTEGER,
  ADD COLUMN IF NOT EXISTS top_programs             TEXT[],
  ADD COLUMN IF NOT EXISTS football_player_majors   TEXT[],
  ADD COLUMN IF NOT EXISTS affordability_band       VARCHAR(10),
  ADD COLUMN IF NOT EXISTS offers_athletic_aid      VARCHAR(10),
  ADD COLUMN IF NOT EXISTS aid_generosity           VARCHAR(10),
  ADD COLUMN IF NOT EXISTS campus_setting           VARCHAR(20),
  ADD COLUMN IF NOT EXISTS distance_profile         VARCHAR(10),
  ADD COLUMN IF NOT EXISTS hs_tier_recruited        VARCHAR(20),
  ADD COLUMN IF NOT EXISTS fit_preferences          JSONB NOT NULL DEFAULT '{}'::JSONB;

-- ── Indexes (GIN on arrays, b-tree on GPA). ──
CREATE INDEX IF NOT EXISTS idx_player_profiles_intended_major
  ON player_profiles USING GIN (intended_major);
CREATE INDEX IF NOT EXISTS idx_player_profiles_levels_open
  ON player_profiles USING GIN (levels_open);
CREATE INDEX IF NOT EXISTS idx_player_profiles_preferred_regions
  ON player_profiles USING GIN (preferred_regions);
CREATE INDEX IF NOT EXISTS idx_player_profiles_weighted_gpa
  ON player_profiles (weighted_gpa);

CREATE INDEX IF NOT EXISTS idx_coach_profiles_top_programs
  ON coach_profiles USING GIN (top_programs);
CREATE INDEX IF NOT EXISTS idx_coach_profiles_football_player_majors
  ON coach_profiles USING GIN (football_player_majors);
CREATE INDEX IF NOT EXISTS idx_coach_profiles_admitted_gpa
  ON coach_profiles (admitted_gpa_min, admitted_gpa_max);
