-- Migration: Normalize legacy division values FBS -> D1 FBS, FCS -> D1 FCS
-- Run this once on production: psql -f fix-division-values.sql

-- Player profiles
UPDATE player_profiles SET college_division = 'D1 FBS' WHERE college_division = 'FBS';
UPDATE player_profiles SET college_division = 'D1 FCS' WHERE college_division = 'FCS';

-- Coach profiles
UPDATE coach_profiles SET college_division = 'D1 FBS' WHERE college_division = 'FBS';
UPDATE coach_profiles SET college_division = 'D1 FCS' WHERE college_division = 'FCS';
