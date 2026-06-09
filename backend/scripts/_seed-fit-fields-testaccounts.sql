-- _seed-fit-fields-testaccounts.sql
-- TEMP / LOCAL-ONLY: populate the Plan 5 fit-matching fields with realistic
-- sample data for the 4 primary test accounts so the new edit-modal fields
-- render + pre-populate visibly. NOT part of the seed MIGRATIONS array.
-- Safe to re-run (plain UPDATEs by email). Delete after eyeballing.
--
-- All enum/major values are string-identical to backend/utils/match-constants.js.

-- ============================================================
-- hsplayer@test.com  — high school player
-- ============================================================
UPDATE player_profiles pp SET
  weighted_gpa             = 4.35,
  has_ap_ib                = TRUE,
  ap_ib_count              = 6,
  class_rank               = '14/312',
  intended_major           = ARRAY['Business Administration','Kinesiology / Exercise Science','Computer Science'],
  home_zip                 = '80401',
  needs_financial_aid      = 'yes',
  needs_scholarship        = 'yes',
  pell_or_first_gen        = TRUE,
  levels_open              = ARRAY['D1 FBS','D1 FCS','D2'],
  preferred_regions        = ARRAY['West','South Central','Southeast'],
  preferred_campus_setting = 'suburban',
  fit_preferences          = jsonb_build_object(
    'importance_playing_time', 5,
    'importance_close_to_home', 2,
    'importance_academics_vs_football', 4,
    'importance_competition_level', 5,
    'looking_for_text', 'Looking for a program that develops QBs, lets me compete early, and has a strong business school.'
  )
FROM users u
WHERE pp.user_id = u.id AND u.email = 'hsplayer@test.com';

-- ============================================================
-- collegeplayer@test.com  — college player (player_profiles row)
-- ============================================================
UPDATE player_profiles pp SET
  weighted_gpa             = 3.80,
  has_ap_ib                = TRUE,
  ap_ib_count              = 3,
  class_rank               = 'Top 15%',
  intended_major           = ARRAY['Finance','Communications'],
  home_zip                 = '30303',
  needs_financial_aid      = 'unsure',
  needs_scholarship        = 'yes',
  pell_or_first_gen        = FALSE,
  levels_open              = ARRAY['D1 FBS','D1 FCS'],
  preferred_regions        = ARRAY['Southeast','Northeast'],
  preferred_campus_setting = 'urban',
  fit_preferences          = jsonb_build_object(
    'importance_playing_time', 4,
    'importance_close_to_home', 3,
    'importance_academics_vs_football', 3,
    'importance_competition_level', 5,
    'looking_for_text', 'Want to step up a level and contribute right away at a program with a winning culture.'
  )
FROM users u
WHERE pp.user_id = u.id AND u.email = 'collegeplayer@test.com';

-- ============================================================
-- transferplayer@test.com  — transfer player
-- ============================================================
UPDATE player_profiles pp SET
  weighted_gpa             = 3.55,
  has_ap_ib                = FALSE,
  ap_ib_count              = NULL,
  class_rank               = '58/240',
  intended_major           = ARRAY['Sports Management','Sociology'],
  home_zip                 = '75201',
  needs_financial_aid      = 'no',
  needs_scholarship        = 'unsure',
  pell_or_first_gen        = FALSE,
  levels_open              = ARRAY['D1 FBS','D1 FCS','D2'],
  preferred_regions        = ARRAY['South Central','Southeast','West'],
  preferred_campus_setting = 'rural',
  fit_preferences          = jsonb_build_object(
    'importance_playing_time', 5,
    'importance_close_to_home', 4,
    'importance_academics_vs_football', 2,
    'importance_competition_level', 4,
    'looking_for_text', 'Final two years of eligibility — need a clear path to the field and a staff that fits my game.'
  )
FROM users u
WHERE pp.user_id = u.id AND u.email = 'transferplayer@test.com';

-- ============================================================
-- collegecoach@test.com  — college coach program profile
-- ============================================================
UPDATE coach_profiles cp SET
  admitted_gpa_min         = 3.10,
  admitted_gpa_max         = 3.90,
  test_optional            = TRUE,
  sat_min                  = 1080,
  sat_max                  = 1320,
  act_min                  = 21,
  act_max                  = 29,
  top_programs             = ARRAY['Business Administration','Nursing','Mechanical Engineering','Kinesiology / Exercise Science'],
  football_player_majors   = ARRAY['Sports Management','Kinesiology / Exercise Science','Communications','Criminal Justice'],
  affordability_band       = 'mid',
  offers_athletic_aid      = 'partial',
  aid_generosity           = 'strong',
  campus_setting           = 'small-town',
  distance_profile         = 'regional',
  hs_tier_recruited        = 'strong',
  fit_preferences          = jsonb_build_object(
    'roster_pct_on_aid', 'most',
    'academic_support', 'strong',
    'affiliation', jsonb_build_array('Public'),
    'offensive_scheme', 'Spread',
    'defensive_scheme', '4-2-5',
    'dev_vs_plug_and_play', 2,
    'great_fit_text', 'Our best fits are developmental athletes with high motors who buy into the culture and grow over 3-4 years.'
  )
FROM users u
WHERE cp.user_id = u.id AND u.email = 'collegecoach@test.com';
