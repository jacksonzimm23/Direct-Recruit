-- 046_add_fit_matching_fields.sql
-- AI Fit-Matching feature (Plan 1 / see match.md) — Foundations.
--
-- Adds the profile-data columns the AI Recruiting Assistant needs to move
-- from FILTERING to two-sided MATCHING. Most fields are MATCHED PAIRS:
-- a player's intended_major <-> a coach's top_programs/football_player_majors,
-- a player's needs_financial_aid <-> a coach's offers_athletic_aid, etc.
--
-- Storage model (decided in plan): the matchable/filterable fields are
-- first-class scalar/array columns (so the RA can WHERE/ORDER BY/score them
-- in SQL later); the soft importance sliders + free-text live in a single
-- `fit_preferences JSONB` blob per table (read-mostly, never filtered).
-- This adds the FIRST JSONB columns to these two tables, intentionally.
--
-- Categorical values (yes/no/unsure, aid options, campus setting, etc.) are
-- stored as VARCHAR and validated by app-level allowlist Sets in
-- backend/utils/match-constants.js — deliberately NO Postgres ENUM and NO
-- CHECK constraints here, because the vocabulary will churn during the form
-- build (Plans 2-4) and lesson #113 wants the allowlist in app code anyway.
--
-- Multi-selects (intended_major, levels_open, preferred_regions, top_programs,
-- football_player_majors) use TEXT[] matching the other_sports convention.
--
-- NOTE: gpa, sat_score, act_score already exist on player_profiles — they are
-- surfaced on the forms in Plan 2, NOT re-added here.
--
-- All columns are nullable or JSONB-defaulted -> no backfill, non-blocking.
-- Idempotent via ADD COLUMN IF NOT EXISTS / CREATE INDEX IF NOT EXISTS.

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
-- player_profiles.fit_preferences keys (validated app-side):
--   importance_playing_time / importance_close_to_home /
--   importance_academics_vs_football / importance_competition_level (int 1-5);
--   looking_for_text (string, <=280 chars).

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
-- coach_profiles.fit_preferences keys (validated app-side):
--   dev_vs_plug_and_play (int 1-5); roster_pct_on_aid; offensive_scheme;
--   defensive_scheme; academic_support; affiliation (string[]);
--   great_fit_text (string, <=280 chars).

-- ── Indexes (minimal; GIN on arrays the RA may membership-test, b-tree on GPA
--    ranges it will score). Do NOT index low-cardinality enums/booleans,
--    free-text, sliders, or JSONB. ──
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
