-- Single transferplayer test profile, per testing.md transferplayer section.
-- Key differences from hsplayer:
--   * transfer = 'y' (lowercase one char)
--   * college_division = previous school's division
--   * team_name = previous school name (must match school-logos.json exactly)
--   * city/state = previous school's location, not hometown
--   * eligibility (YOE) REQUIRED for sidebar display
--   * Exactly 2 player_games rows: season_year=0 (career) and season_year=-1 (last season)
--   * Career stats = single jsonb row with aggregated career numbers
--   * Last season stats = single jsonb row with aggregated single-season numbers
--   * Offers populated (don't include previous school)
--   * Subscription active (paid role like hsplayer)

BEGIN;

WITH new_user AS (
  INSERT INTO users (
    id, email, role, email_verified, profile_completed, is_active,
    cognito_sub, username,
    subscription_status, subscription_tier, stripe_customer_id, stripe_subscription_id
  ) VALUES (
    uuid_generate_v4(),
    'randtest.darius.cole.55293@test.com',
    'player', true, true, true,
    'randtest-' || gen_random_uuid()::text,
    'dariuscole7142',
    'active', 'player',
    'cus_randtest_b9c4l3mn0px8sr',
    'sub_randtest_u3o6hi9kw5cf2d'
  )
  RETURNING id
),
new_profile AS (
  INSERT INTO player_profiles (
    user_id, first_name, last_name, date_of_birth, team_name, graduation_year,
    city, state, height, weight, gpa, sat_score, act_score, bio, phone,
    hudl_profile, twitter_handle, instagram_handle, player_status, username,
    cc_views, college_division, transfer, eligibility, number, conference,
    offers, star_rating, followers_count, following_count,
    message_permissions, profile_visibility, position,
    lastseasonstat1, lastseasonstat2, lastseasonstat3,
    careerstat1, careerstat2, careerstat3,
    pff_grade
  )
  SELECT
    nu.id, 'Darius', 'Cole', DATE '2004-08-14',
    'SUNY College of Agriculture & Technology at Cobleskill', 2027,
    'Cobleskill', 'New York', 73, 195, 3.21, NULL, NULL,
    'In the portal. Looking for a new home to compete for a championship.',
    '555-419-2683',
    'https://hudl.com/profile/dariuscole7142',
    '@dariuscole7142', '@dariuscole7142',
    'junior', 'dariuscole7142',
    612, 'D3', 'y', 2, 11, 'Empire 8',
    'Wofford College, D1 FCS|Houston Christian, D1 FCS|University of Richmond, D1 FCS|Lycoming College, D3|University of Arkansas at Pine Bluff, D1 FCS|Rensselaer Polytechnic Institute - RPI, D3|University of Houston, D1 FBS',
    NULL, 384, 198,
    'everyone', 'everyone', 'WR',
    1050, 9, 0,
    2240, 18, 0,
    82.5
  FROM new_user nu
  RETURNING id, user_id
),
g_career AS (
  -- Career totals bucket: season_year = 0, opponent + result NULL
  INSERT INTO player_games (player_id, game_date, season_year, opponent, result)
  SELECT id, CURRENT_DATE, 0, NULL, NULL FROM new_profile
  RETURNING id, player_id
),
g_lastseason AS (
  -- Last season totals bucket: season_year = -1, opponent + result NULL
  INSERT INTO player_games (player_id, game_date, season_year, opponent, result)
  SELECT id, CURRENT_DATE, -1, NULL, NULL FROM new_profile
  RETURNING id, player_id
),
hl1 AS (
  INSERT INTO player_highlights (user_id, highlight_type, title, hudl_link, video_url)
  SELECT user_id, 'sophomore', 'Sophomore Season Highlights', 'https://hudl.com/v/dariuscole7142/sophomore', NULL
  FROM new_profile RETURNING id
),
hl2 AS (
  INSERT INTO player_highlights (user_id, highlight_type, title, hudl_link, video_url)
  SELECT user_id, 'junior', 'Junior Season Highlights', 'https://hudl.com/v/dariuscole7142/junior', NULL
  FROM new_profile RETURNING id
),
stat_career AS (
  -- WR career stats (within testing.md ranges: rec 110-180, rec_yds 1800-2800, rec_tds 14-25)
  INSERT INTO player_game_stats (game_id, position, stats, player_name, user_id)
  SELECT g_career.id, 'WR',
    jsonb_build_object('rec', 138, 'rec_yds', 2240, 'rec_tds', 18),
    'Darius Cole', np.user_id
  FROM g_career, new_profile np
  RETURNING id
)
-- WR last-season stats (~career / 2)
INSERT INTO player_game_stats (game_id, position, stats, player_name, user_id)
SELECT g_lastseason.id, 'WR',
  jsonb_build_object('rec', 64, 'rec_yds', 1050, 'rec_tds', 9),
  'Darius Cole', np.user_id
FROM g_lastseason, new_profile np;

COMMIT;
