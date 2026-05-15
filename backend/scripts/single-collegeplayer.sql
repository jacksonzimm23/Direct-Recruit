-- Single collegeplayer test profile, per testing.md collegeplayer section.
-- Key differences from hsplayer:
--   * college_division = real division of team_name (D1 FBS here)
--   * transfer = 'no' (literal lowercase)
--   * team_name matches school-logos.json exactly
--   * city/state = school's location, not hometown
--   * conference set (free-text, realistic per division)
--   * offers = NULL (already committed)
--   * sat_score / act_score = NULL
--   * subscription_* all NULL/'none' (free role, no Stripe)
--   * Bio is portal-signaling (~20% of cohort should signal for PI demos)
--   * updated_at backdated 1-14 days so PI sorts him near the top

BEGIN;

WITH new_user AS (
  INSERT INTO users (
    id, email, role, email_verified, profile_completed, is_active,
    cognito_sub, username,
    subscription_status, subscription_tier, stripe_customer_id, stripe_subscription_id
  ) VALUES (
    uuid_generate_v4(),
    'randtest.marcus.bell.83471@test.com',
    'player', true, true, true,
    'randtest-' || gen_random_uuid()::text,
    'marcusbell5083',
    'none', NULL, NULL, NULL
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
    nu.id, 'Marcus', 'Bell', DATE '2004-09-22',
    'West Virginia University', 2027,
    'Morgantown', 'West Virginia', 72, 195, 3.18, NULL, NULL,
    'Weighing my options. Open to the transfer portal for the right fit.',
    '555-307-4198',
    'https://hudl.com/profile/marcusbell5083',
    '@marcusbell5083', '@marcusbell5083',
    'junior', 'marcusbell5083',
    687, 'D1 FBS', 'no', 2, 23, 'Big 12',
    NULL,
    4, 412, 218,
    'everyone', 'everyone', 'CB',
    71, 4, 14,
    143, 8, 26,
    78.2
  FROM new_user nu
  RETURNING id, user_id
),
g1 AS (INSERT INTO player_games (player_id, game_date, season_year, opponent, result)
       SELECT id, DATE '2025-08-30', 2026, 'Penn State', 'L 14-31' FROM new_profile RETURNING id, player_id),
g2 AS (INSERT INTO player_games (player_id, game_date, season_year, opponent, result)
       SELECT id, DATE '2025-09-06', 2026, 'Albany', 'W 49-14' FROM new_profile RETURNING id, player_id),
g3 AS (INSERT INTO player_games (player_id, game_date, season_year, opponent, result)
       SELECT id, DATE '2025-09-13', 2026, 'Pittsburgh', 'W 27-24' FROM new_profile RETURNING id, player_id),
g4 AS (INSERT INTO player_games (player_id, game_date, season_year, opponent, result)
       SELECT id, DATE '2025-09-20', 2026, 'Kansas', 'L 21-28' FROM new_profile RETURNING id, player_id),
g5 AS (INSERT INTO player_games (player_id, game_date, season_year, opponent, result)
       SELECT id, DATE '2025-09-27', 2026, 'Oklahoma State', 'L 17-24' FROM new_profile RETURNING id, player_id),
g6 AS (INSERT INTO player_games (player_id, game_date, season_year, opponent, result)
       SELECT id, DATE '2025-10-04', 2026, 'Iowa State', 'W 23-20' FROM new_profile RETURNING id, player_id),
g7 AS (INSERT INTO player_games (player_id, game_date, season_year, opponent, result)
       SELECT id, DATE '2025-10-11', 2026, 'Houston', 'W 31-17' FROM new_profile RETURNING id, player_id),
g8 AS (INSERT INTO player_games (player_id, game_date, season_year, opponent, result)
       SELECT id, DATE '2025-10-18', 2026, 'TCU', 'L 13-27' FROM new_profile RETURNING id, player_id),
g9 AS (INSERT INTO player_games (player_id, game_date, season_year, opponent, result)
       SELECT id, DATE '2025-10-25', 2026, 'Cincinnati', 'W 35-21' FROM new_profile RETURNING id, player_id),
g10 AS (INSERT INTO player_games (player_id, game_date, season_year, opponent, result)
       SELECT id, DATE '2025-11-01', 2026, 'Baylor', 'L 24-31' FROM new_profile RETURNING id, player_id),
hl1 AS (INSERT INTO player_highlights (user_id, highlight_type, title, hudl_link, video_url)
        SELECT user_id, 'sophomore', 'Sophomore Season Highlights', 'https://hudl.com/v/marcusbell5083/sophomore', NULL FROM new_profile RETURNING id),
hl2 AS (INSERT INTO player_highlights (user_id, highlight_type, title, hudl_link, video_url)
        SELECT user_id, 'junior', 'Junior Season Highlights', 'https://hudl.com/v/marcusbell5083/junior', NULL FROM new_profile RETURNING id),
-- CB jsonb keys: tackles (1-10), int (0-2), pbu (0-3) per testing.md
gs1 AS (INSERT INTO player_game_stats (game_id, position, stats, player_name, user_id)
        SELECT g1.id, 'CB', jsonb_build_object('tackles', 6, 'int', 0, 'pbu', 2), 'Marcus Bell', np.user_id
        FROM g1, new_profile np RETURNING id),
gs2 AS (INSERT INTO player_game_stats (game_id, position, stats, player_name, user_id)
        SELECT g2.id, 'CB', jsonb_build_object('tackles', 3, 'int', 1, 'pbu', 1), 'Marcus Bell', np.user_id
        FROM g2, new_profile np RETURNING id),
gs3 AS (INSERT INTO player_game_stats (game_id, position, stats, player_name, user_id)
        SELECT g3.id, 'CB', jsonb_build_object('tackles', 8, 'int', 0, 'pbu', 3), 'Marcus Bell', np.user_id
        FROM g3, new_profile np RETURNING id),
gs4 AS (INSERT INTO player_game_stats (game_id, position, stats, player_name, user_id)
        SELECT g4.id, 'CB', jsonb_build_object('tackles', 5, 'int', 2, 'pbu', 1), 'Marcus Bell', np.user_id
        FROM g4, new_profile np RETURNING id),
gs5 AS (INSERT INTO player_game_stats (game_id, position, stats, player_name, user_id)
        SELECT g5.id, 'CB', jsonb_build_object('tackles', 7, 'int', 0, 'pbu', 2), 'Marcus Bell', np.user_id
        FROM g5, new_profile np RETURNING id),
gs6 AS (INSERT INTO player_game_stats (game_id, position, stats, player_name, user_id)
        SELECT g6.id, 'CB', jsonb_build_object('tackles', 4, 'int', 1, 'pbu', 0), 'Marcus Bell', np.user_id
        FROM g6, new_profile np RETURNING id),
gs7 AS (INSERT INTO player_game_stats (game_id, position, stats, player_name, user_id)
        SELECT g7.id, 'CB', jsonb_build_object('tackles', 9, 'int', 0, 'pbu', 3), 'Marcus Bell', np.user_id
        FROM g7, new_profile np RETURNING id),
gs8 AS (INSERT INTO player_game_stats (game_id, position, stats, player_name, user_id)
        SELECT g8.id, 'CB', jsonb_build_object('tackles', 10, 'int', 0, 'pbu', 1), 'Marcus Bell', np.user_id
        FROM g8, new_profile np RETURNING id),
gs9 AS (INSERT INTO player_game_stats (game_id, position, stats, player_name, user_id)
        SELECT g9.id, 'CB', jsonb_build_object('tackles', 5, 'int', 0, 'pbu', 2), 'Marcus Bell', np.user_id
        FROM g9, new_profile np RETURNING id)
INSERT INTO player_game_stats (game_id, position, stats, player_name, user_id)
SELECT g10.id, 'CB', jsonb_build_object('tackles', 7, 'int', 1, 'pbu', 3), 'Marcus Bell', np.user_id
FROM g10, new_profile np;

-- Backdate updated_at so PI's ORDER BY updated_at DESC ranks him highly (1-14 days ago)
UPDATE player_profiles
   SET updated_at = NOW() - (7 * interval '1 day')
 WHERE username = 'marcusbell5083';

COMMIT;
