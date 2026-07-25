BEGIN;

WITH new_user AS (
  INSERT INTO users (
    id, email, password_hash, role, email_verified, profile_completed, is_active,
    cognito_sub, username,
    subscription_status, subscription_tier, stripe_customer_id, stripe_subscription_id
  ) VALUES (
    uuid_generate_v4(),
    'randtest.caleb.wright.48217@test.com',
    '$2b$10$yFG8cVPzXkv79tHz50sJK.Pp6SM/TEX3tQzyyCsMxvmXGPBunDtBW',
    'player', true, true, true,
    'randtest-' || gen_random_uuid()::text,
    'calebwright3826',
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
    careerstat1, careerstat2, careerstat3
  )
  SELECT
    nu.id, 'Caleb', 'Wright', DATE '2009-04-12', 'Denver Classical', 2027,
    'Denver', 'Colorado', 75, 210, 3.42, 1380, 28,
    'Dual-threat QB with a high football IQ. Two-time team captain. Grinding for a state title.',
    '555-302-7841',
    'https://hudl.com/profile/calebwright3826',
    '@calebwright3826', '@calebwright3826',
    'junior', 'calebwright3826',
    312, NULL, 'no', 4, '7', NULL,
    'University of Alabama at Birmingham (UAB), D1 FBS|Pennsylvania State University (Penn State), D1 FBS|Florida Atlantic University, D1 FBS|Montana State University, D1 FCS|Mercyhurst University, D1 FCS|Stetson University, D1 FCS|University of Central Oklahoma, D2|Pittsburg State University, D2|University of North Carolina at Pembroke, D2|Carthage College, D3',
    4, 147, 92,
    'everyone', 'everyone', 'QB',
    '2487 yds', '24 TDs', '8 tackles',
    '5612 yds', '54 TDs', '14 tackles'
  FROM new_user nu
  RETURNING id, user_id
),
g1 AS (INSERT INTO player_games (player_id, game_date, season_year, opponent, result)
       SELECT id, DATE '2025-08-29', 2026, 'Lincoln High', 'W 34-17' FROM new_profile RETURNING id, player_id),
g2 AS (INSERT INTO player_games (player_id, game_date, season_year, opponent, result)
       SELECT id, DATE '2025-09-05', 2026, 'Denver Central', 'W 28-21' FROM new_profile RETURNING id, player_id),
g3 AS (INSERT INTO player_games (player_id, game_date, season_year, opponent, result)
       SELECT id, DATE '2025-09-12', 2026, 'Westlake Academy', 'L 24-31' FROM new_profile RETURNING id, player_id),
g4 AS (INSERT INTO player_games (player_id, game_date, season_year, opponent, result)
       SELECT id, DATE '2025-09-19', 2026, 'Plano East', 'W 41-13' FROM new_profile RETURNING id, player_id),
g5 AS (INSERT INTO player_games (player_id, game_date, season_year, opponent, result)
       SELECT id, DATE '2025-09-26', 2026, 'Cedar Ridge', 'W 35-28' FROM new_profile RETURNING id, player_id),
g6 AS (INSERT INTO player_games (player_id, game_date, season_year, opponent, result)
       SELECT id, DATE '2025-10-03', 2026, 'Frisco Prep', 'W 27-10' FROM new_profile RETURNING id, player_id),
g7 AS (INSERT INTO player_games (player_id, game_date, season_year, opponent, result)
       SELECT id, DATE '2025-10-10', 2026, 'Highland Park', 'L 17-24' FROM new_profile RETURNING id, player_id),
g8 AS (INSERT INTO player_games (player_id, game_date, season_year, opponent, result)
       SELECT id, DATE '2025-10-17', 2026, 'Round Rock', 'W 38-14' FROM new_profile RETURNING id, player_id),
g9 AS (INSERT INTO player_games (player_id, game_date, season_year, opponent, result)
       SELECT id, DATE '2025-10-24', 2026, 'Katy Tompkins', 'W 30-23' FROM new_profile RETURNING id, player_id),
g10 AS (INSERT INTO player_games (player_id, game_date, season_year, opponent, result)
       SELECT id, DATE '2025-10-31', 2026, 'Allen', 'L 21-35' FROM new_profile RETURNING id, player_id),
hl1 AS (INSERT INTO player_highlights (user_id, highlight_type, title, hudl_link, video_url)
        SELECT user_id, 'junior', 'Junior Season Highlights', 'https://hudl.com/v/calebwright3826/junior', NULL FROM new_profile RETURNING id),
hl2 AS (INSERT INTO player_highlights (user_id, highlight_type, title, hudl_link, video_url)
        SELECT user_id, 'sophomore', 'Sophomore Season Highlights', 'https://hudl.com/v/calebwright3826/sophomore', NULL FROM new_profile RETURNING id),
gs1 AS (INSERT INTO player_game_stats (game_id, position, stats, player_name, user_id)
        SELECT g1.id, 'QB', jsonb_build_object('pass_yds', 287, 'pass_tds', 3, 'rush_yds', 64, 'rush_tds', 1, 'ints', 1, 'comp_%', 68.4), 'Caleb Wright', np.user_id
        FROM g1, new_profile np RETURNING id),
gs2 AS (INSERT INTO player_game_stats (game_id, position, stats, player_name, user_id)
        SELECT g2.id, 'QB', jsonb_build_object('pass_yds', 224, 'pass_tds', 2, 'rush_yds', 41, 'rush_tds', 0, 'ints', 0, 'comp_%', 62.1), 'Caleb Wright', np.user_id
        FROM g2, new_profile np RETURNING id),
gs3 AS (INSERT INTO player_game_stats (game_id, position, stats, player_name, user_id)
        SELECT g3.id, 'QB', jsonb_build_object('pass_yds', 198, 'pass_tds', 1, 'rush_yds', 87, 'rush_tds', 1, 'ints', 2, 'comp_%', 55.7), 'Caleb Wright', np.user_id
        FROM g3, new_profile np RETURNING id),
gs4 AS (INSERT INTO player_game_stats (game_id, position, stats, player_name, user_id)
        SELECT g4.id, 'QB', jsonb_build_object('pass_yds', 312, 'pass_tds', 4, 'rush_yds', 28, 'rush_tds', 0, 'ints', 0, 'comp_%', 71.2), 'Caleb Wright', np.user_id
        FROM g4, new_profile np RETURNING id),
gs5 AS (INSERT INTO player_game_stats (game_id, position, stats, player_name, user_id)
        SELECT g5.id, 'QB', jsonb_build_object('pass_yds', 256, 'pass_tds', 2, 'rush_yds', 102, 'rush_tds', 2, 'ints', 1, 'comp_%', 64.8), 'Caleb Wright', np.user_id
        FROM g5, new_profile np RETURNING id),
gs6 AS (INSERT INTO player_game_stats (game_id, position, stats, player_name, user_id)
        SELECT g6.id, 'QB', jsonb_build_object('pass_yds', 209, 'pass_tds', 3, 'rush_yds', 55, 'rush_tds', 0, 'ints', 0, 'comp_%', 70.0), 'Caleb Wright', np.user_id
        FROM g6, new_profile np RETURNING id),
gs7 AS (INSERT INTO player_game_stats (game_id, position, stats, player_name, user_id)
        SELECT g7.id, 'QB', jsonb_build_object('pass_yds', 174, 'pass_tds', 1, 'rush_yds', 48, 'rush_tds', 1, 'ints', 1, 'comp_%', 58.3), 'Caleb Wright', np.user_id
        FROM g7, new_profile np RETURNING id),
gs8 AS (INSERT INTO player_game_stats (game_id, position, stats, player_name, user_id)
        SELECT g8.id, 'QB', jsonb_build_object('pass_yds', 298, 'pass_tds', 3, 'rush_yds', 73, 'rush_tds', 1, 'ints', 0, 'comp_%', 66.7), 'Caleb Wright', np.user_id
        FROM g8, new_profile np RETURNING id),
gs9 AS (INSERT INTO player_game_stats (game_id, position, stats, player_name, user_id)
        SELECT g9.id, 'QB', jsonb_build_object('pass_yds', 241, 'pass_tds', 2, 'rush_yds', 91, 'rush_tds', 1, 'ints', 1, 'comp_%', 63.5), 'Caleb Wright', np.user_id
        FROM g9, new_profile np RETURNING id)
INSERT INTO player_game_stats (game_id, position, stats, player_name, user_id)
SELECT g10.id, 'QB', jsonb_build_object('pass_yds', 188, 'pass_tds', 1, 'rush_yds', 35, 'rush_tds', 0, 'ints', 2, 'comp_%', 54.9), 'Caleb Wright', np.user_id
FROM g10, new_profile np;

COMMIT;
