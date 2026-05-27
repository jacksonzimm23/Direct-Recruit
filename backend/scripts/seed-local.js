/**
 * Local Development Database Seed Script
 *
 * Sets up the database schema and creates test users for all 6 roles.
 * Run: npm run seed (from backend/ directory)
 *
 * This script is idempotent — safe to run multiple times.
 * Production is NOT affected — this only connects to the DB in your .env.
 */

const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: false
});

const SALT_ROUNDS = 10;
const TEST_PASSWORD = 'Test123!@#';

// Migration scripts in chronological order
const MIGRATIONS = [
  'schema.sql',
  'add-usernames.sql',
  'add-cognito-sub.sql',
  'migrate_position_to_varchar.sql',
  'add-conference-column.sql',
  'add-message-indexes.sql',
  'add-last-read.sql',
  'add-profile-views.sql',
  'add-recruiting-boards.sql',
  'add-conversation-created-by.sql',
  'add-highlight-video-url.sql',
  'add-other-profiles-follow-counts.sql',
  'fix-timestamp-columns.sql',
  'add-private-profiles.sql',
  'add-share-engagement.sql',
  'add-ai-chat-history.sql',
  'add-coach-profile-views.sql',
  'add-portal-watchlist.sql',
  'add-ai-analytics.sql',
  'add-ra-saved-players.sql',
  'add-ai-engagement-events.sql',
  'add-coach-user-id-to-ai-analytics.sql',
  'add-profile-switching.sql',
  'add-stripe-subscriptions.sql',
  'add-fuzzy-search.sql',
  'add-engagement-score-index.sql',
  'add-popularity-indexes.sql',
  'expand-profile-views.sql',
  'add-coach-verification.sql',
  'add-coach-verification-school-lock.sql',
  'add-switch-invite-audit.sql',
  'add-subscription-source.sql',
  'add-device-tokens.sql',
  'add-message-attachments.sql',
  'add-profile-views-popularity-index.sql',
  'drop-vestigial-email-columns.sql',
  'add-suggested-connections-mv.sql',
  'fix-player-height-type.sql',
  'fix-user-fk-cascades.sql',
  'add-coach-signup-request-archival.sql',
  'add-player-athletics.sql',
  'add-pff-grade.sql',
  'add-named-personal-boards.sql',
  'add-board-groups.sql',
  'add-team-questionnaires.sql',
  'refactor-questionnaire-to-per-school.sql',
  'add-recruit-pipeline.sql',
  'add-pipeline-handoffs.sql',
  'add-pipeline-soft-delete.sql',
  'add-specs-positions.sql',
  'add-coach-team-switch.sql',
  'add-free-coach-invite.sql',
  'add-reports-and-blocks.sql'
];

async function applyManualFixes() {
  // These columns exist in production but have no migration scripts
  const fixes = [
    // Enum fix
    "DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'other' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'user_role')) THEN ALTER TYPE user_role ADD VALUE 'other'; END IF; END$$",

    // users table
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS username VARCHAR(50) UNIQUE",

    // player_profiles
    "ALTER TABLE player_profiles ADD COLUMN IF NOT EXISTS college_division VARCHAR(50)",
    "ALTER TABLE player_profiles ADD COLUMN IF NOT EXISTS transfer VARCHAR(10)",
    "ALTER TABLE player_profiles ADD COLUMN IF NOT EXISTS eligibility INTEGER",
    "ALTER TABLE player_profiles ADD COLUMN IF NOT EXISTS number VARCHAR(10)",
    "ALTER TABLE player_profiles ADD COLUMN IF NOT EXISTS conference VARCHAR(100)",
    "ALTER TABLE player_profiles ADD COLUMN IF NOT EXISTS offers TEXT",
    "ALTER TABLE player_profiles ADD COLUMN IF NOT EXISTS star_rating INTEGER",
    "ALTER TABLE player_profiles ADD COLUMN IF NOT EXISTS followers_count INTEGER DEFAULT 0",
    "ALTER TABLE player_profiles ADD COLUMN IF NOT EXISTS following_count INTEGER DEFAULT 0",
    "ALTER TABLE player_profiles ADD COLUMN IF NOT EXISTS message_permissions VARCHAR(20) DEFAULT 'everyone'",
    "ALTER TABLE player_profiles ADD COLUMN IF NOT EXISTS lastseasonstat1 VARCHAR(50)",
    "ALTER TABLE player_profiles ADD COLUMN IF NOT EXISTS lastseasonstat2 VARCHAR(50)",
    "ALTER TABLE player_profiles ADD COLUMN IF NOT EXISTS lastseasonstat3 VARCHAR(50)",
    "ALTER TABLE player_profiles ADD COLUMN IF NOT EXISTS careerstat1 VARCHAR(50)",
    "ALTER TABLE player_profiles ADD COLUMN IF NOT EXISTS careerstat2 VARCHAR(50)",
    "ALTER TABLE player_profiles ADD COLUMN IF NOT EXISTS careerstat3 VARCHAR(50)",

    // coach_profiles
    "ALTER TABLE coach_profiles ADD COLUMN IF NOT EXISTS followers_count INTEGER DEFAULT 0",
    "ALTER TABLE coach_profiles ADD COLUMN IF NOT EXISTS following_count INTEGER DEFAULT 0",
    "ALTER TABLE coach_profiles ADD COLUMN IF NOT EXISTS message_permissions VARCHAR(20) DEFAULT 'everyone'",

    // other_profiles
    `CREATE TABLE IF NOT EXISTS other_profiles (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      first_name VARCHAR(100) NOT NULL,
      last_name VARCHAR(100) NOT NULL,
      subheader VARCHAR(255),
      bio TEXT,
      profile_image_url TEXT,
      profile_picture_url TEXT,
      username VARCHAR(50) UNIQUE,
      followers_count INTEGER DEFAULT 0,
      following_count INTEGER DEFAULT 0,
      profile_visibility VARCHAR(20) DEFAULT 'everyone',
      message_permissions VARCHAR(20) DEFAULT 'everyone',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    "ALTER TABLE other_profiles ADD COLUMN IF NOT EXISTS profile_picture_url TEXT",
    "ALTER TABLE other_profiles ADD COLUMN IF NOT EXISTS message_permissions VARCHAR(20) DEFAULT 'everyone'",

    // posts
    "ALTER TABLE posts ADD COLUMN IF NOT EXISTS media_urls TEXT[]",
    "ALTER TABLE posts ADD COLUMN IF NOT EXISTS visibility VARCHAR(20) DEFAULT 'public'",
    "ALTER TABLE posts ADD COLUMN IF NOT EXISTS shares_count INTEGER DEFAULT 0",
    "ALTER TABLE posts ADD COLUMN IF NOT EXISTS saves_count INTEGER DEFAULT 0",
    "ALTER TABLE posts ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN DEFAULT false",
    "ALTER TABLE posts ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT false",
    "ALTER TABLE posts ADD COLUMN IF NOT EXISTS engagement_score NUMERIC DEFAULT 0",

    // post_comments
    "ALTER TABLE post_comments ADD COLUMN IF NOT EXISTS parent_comment_id UUID REFERENCES post_comments(id) ON DELETE CASCADE",
    "ALTER TABLE post_comments ADD COLUMN IF NOT EXISTS likes_count INTEGER DEFAULT 0",
    "ALTER TABLE post_comments ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT false",

    // recruiting_boards
    "ALTER TABLE recruiting_boards ADD COLUMN IF NOT EXISTS owner_user_id UUID REFERENCES users(id) ON DELETE CASCADE",
    "ALTER TABLE recruiting_boards ADD COLUMN IF NOT EXISTS is_personal BOOLEAN DEFAULT false",
    "ALTER TABLE recruiting_boards ADD COLUMN IF NOT EXISTS board_name VARCHAR(255)",
    "ALTER TABLE recruiting_boards ADD COLUMN IF NOT EXISTS players JSONB DEFAULT '[]'::jsonb",
    "ALTER TABLE recruiting_boards ADD COLUMN IF NOT EXISTS collab JSONB DEFAULT '[]'::jsonb",

    // notifications
    `CREATE TABLE IF NOT EXISTS notifications (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type VARCHAR(50) NOT NULL,
      title VARCHAR(255) NOT NULL,
      message TEXT NOT NULL,
      related_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
      related_entity_id UUID,
      related_entity_type VARCHAR(50),
      is_read BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,

    // pending_email_changes
    `CREATE TABLE IF NOT EXISTS pending_email_changes (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      current_email VARCHAR(255) NOT NULL,
      new_email VARCHAR(255) NOT NULL,
      verification_code VARCHAR(10) NOT NULL,
      expires_at TIMESTAMP NOT NULL,
      resend_count INTEGER DEFAULT 0,
      last_resend_at TIMESTAMP,
      cooldown_until TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,

    // pending_password_resets
    `CREATE TABLE IF NOT EXISTS pending_password_resets (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      email VARCHAR(255) NOT NULL,
      verification_code VARCHAR(10) NOT NULL,
      verified BOOLEAN DEFAULT false,
      expires_at TIMESTAMP NOT NULL,
      resend_count INTEGER DEFAULT 0,
      last_resend_at TIMESTAMP,
      cooldown_until TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,

    // post_saves
    `CREATE TABLE IF NOT EXISTS post_saves (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(post_id, user_id)
    )`,

    // comment_likes
    `CREATE TABLE IF NOT EXISTS comment_likes (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      comment_id UUID NOT NULL REFERENCES post_comments(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(comment_id, user_id)
    )`,

    // post_shares
    `CREATE TABLE IF NOT EXISTS post_shares (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      original_post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      share_type VARCHAR(20) NOT NULL DEFAULT 'repost',
      quote_content TEXT,
      media_urls TEXT[],
      media_type VARCHAR(10),
      likes_count INTEGER DEFAULT 0,
      comments_count INTEGER DEFAULT 0,
      shares_count INTEGER DEFAULT 0,
      saves_count INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,

    // share_likes
    `CREATE TABLE IF NOT EXISTS share_likes (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      share_id UUID NOT NULL REFERENCES post_shares(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(share_id, user_id)
    )`,

    // share_comments
    `CREATE TABLE IF NOT EXISTS share_comments (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      share_id UUID NOT NULL REFERENCES post_shares(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      parent_comment_id UUID,
      likes_count INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,

    // share_saves
    `CREATE TABLE IF NOT EXISTS share_saves (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      share_id UUID NOT NULL REFERENCES post_shares(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(share_id, user_id)
    )`,

    // share_comment_likes
    `CREATE TABLE IF NOT EXISTS share_comment_likes (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      comment_id UUID NOT NULL REFERENCES share_comments(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(comment_id, user_id)
    )`,

    // player_games
    `CREATE TABLE IF NOT EXISTS player_games (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      player_id UUID NOT NULL REFERENCES player_profiles(id) ON DELETE CASCADE,
      game_date DATE,
      season_year INTEGER,
      opponent VARCHAR(255),
      result VARCHAR(50),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,

    // player_game_stats
    `CREATE TABLE IF NOT EXISTS player_game_stats (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      game_id UUID NOT NULL REFERENCES player_games(id) ON DELETE CASCADE,
      position VARCHAR(50) NOT NULL,
      stats JSONB,
      player_name VARCHAR(255),
      user_id UUID REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`
  ];

  for (const sql of fixes) {
    try { await pool.query(sql); } catch (err) { /* already exists */ }
  }
}

async function runMigrations() {
  console.log('\n--- Running database migrations ---\n');

  for (const migration of MIGRATIONS) {
    const filePath = path.join(__dirname, migration);
    if (!fs.existsSync(filePath)) {
      console.log(`  SKIP: ${migration} (file not found)`);
      continue;
    }

    const sql = fs.readFileSync(filePath, 'utf8');
    try {
      await pool.query(sql);
      console.log(`  OK: ${migration}`);
    } catch (err) {
      // Many migrations use IF NOT EXISTS, so errors on re-run are expected
      if (err.message.includes('already exists') ||
          err.message.includes('duplicate key') ||
          err.message.includes('multiple primary keys')) {
        console.log(`  SKIP: ${migration} (already applied)`);
      } else {
        console.error(`  ERROR: ${migration} — ${err.message}`);
      }
    }
  }
}

async function seedUsers() {
  console.log('\n--- Seeding test users ---\n');

  const passwordHash = await bcrypt.hash(TEST_PASSWORD, SALT_ROUNDS);

  const users = [
    { email: 'hsplayer@test.com', role: 'player' },
    { email: 'collegeplayer@test.com', role: 'player' },
    { email: 'transferplayer@test.com', role: 'player' },
    { email: 'hscoach@test.com', role: 'coach' },
    { email: 'collegecoach@test.com', role: 'coach' },
    { email: 'other@test.com', role: 'other' }
  ];

  const createdUsers = {};

  for (const user of users) {
    // Check if user already exists
    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [user.email]);
    if (existing.rows.length > 0) {
      createdUsers[user.email] = existing.rows[0].id;
      console.log(`  EXISTS: ${user.email} (${user.role}) — id: ${existing.rows[0].id}`);
      continue;
    }

    const result = await pool.query(
      `INSERT INTO users (email, password_hash, role, email_verified, profile_completed, is_active, cognito_sub)
       VALUES ($1, $2, $3, true, true, true, $4)
       RETURNING id`,
      [user.email, passwordHash, user.role, `local-${Date.now()}-${Math.random().toString(36).slice(2)}`]
    );

    createdUsers[user.email] = result.rows[0].id;
    console.log(`  CREATED: ${user.email} (${user.role}) — id: ${result.rows[0].id}`);
  }

  return createdUsers;
}

async function seedProfiles(users) {
  console.log('\n--- Seeding profiles ---\n');

  // HS Player profile
  const hsPlayerId = users['hsplayer@test.com'];
  const hsPlayerExists = await pool.query('SELECT id FROM player_profiles WHERE user_id = $1', [hsPlayerId]);
  if (hsPlayerExists.rows.length === 0) {
    await pool.query(
      `INSERT INTO player_profiles (user_id, first_name, last_name, position, height, weight, graduation_year,
       gpa, team_name, city, state, bio, username)
       VALUES ($1, 'Jake', 'Thompson', 'QB', 74, 195, 2027, 3.8, 'Lincoln High School', 'Austin', 'Texas',
       'Dual-threat QB with a strong arm and quick feet. 3-year varsity starter.', 'jakethompson')`,
      [hsPlayerId]
    );
    console.log('  CREATED: HS Player profile (Jake Thompson)');
  } else {
    console.log('  EXISTS: HS Player profile');
  }

  // College Player profile
  const collegePlayerId = users['collegeplayer@test.com'];
  const collegePlayerExists = await pool.query('SELECT id FROM player_profiles WHERE user_id = $1', [collegePlayerId]);
  if (collegePlayerExists.rows.length === 0) {
    await pool.query(
      `INSERT INTO player_profiles (user_id, first_name, last_name, position, height, weight, graduation_year,
       gpa, team_name, city, state, bio, username, college_division)
       VALUES ($1, 'Marcus', 'Williams', 'WR', 73, 185, 2026, 3.5, 'Colorado Buffaloes', 'Boulder', 'Colorado',
       'Speed receiver with great route-running ability. Big 12 Conference.', 'marcuswilliams', 'D1 FBS')`,
      [collegePlayerId]
    );
    console.log('  CREATED: College Player profile (Marcus Williams)');
  } else {
    console.log('  EXISTS: College Player profile');
  }

  // Transfer Player profile
  const transferPlayerId = users['transferplayer@test.com'];
  const transferPlayerExists = await pool.query('SELECT id FROM player_profiles WHERE user_id = $1', [transferPlayerId]);
  if (transferPlayerExists.rows.length === 0) {
    await pool.query(
      `INSERT INTO player_profiles (user_id, first_name, last_name, position, height, weight, graduation_year,
       gpa, team_name, city, state, bio, username, college_division, transfer)
       VALUES ($1, 'DeShawn', 'Carter', 'RB', 71, 210, 2025, 3.2, 'Oregon State Beavers', 'Corvallis', 'Oregon',
       'Physical runner with great vision. Seeking new opportunity in the portal.', 'deshawncarter', 'D1 FBS', 'y')`,
      [transferPlayerId]
    );
    console.log('  CREATED: Transfer Player profile (DeShawn Carter)');
  } else {
    console.log('  EXISTS: Transfer Player profile');
  }

  // HS Coach profile
  const hsCoachId = users['hscoach@test.com'];
  const hsCoachExists = await pool.query('SELECT id FROM coach_profiles WHERE user_id = $1', [hsCoachId]);
  if (hsCoachExists.rows.length === 0) {
    await pool.query(
      `INSERT INTO coach_profiles (user_id, first_name, last_name, team_name, position_title, city, state, bio, username)
       VALUES ($1, 'Mike', 'Rodriguez', 'Lincoln High School', 'Head Coach', 'Austin', 'Texas',
       '15 years of coaching experience. Building champions on and off the field.', 'coachrodriguez')`,
      [hsCoachId]
    );
    console.log('  CREATED: HS Coach profile (Mike Rodriguez)');
  } else {
    console.log('  EXISTS: HS Coach profile');
  }

  // College Coach profile
  const collegeCoachId = users['collegecoach@test.com'];
  const collegeCoachExists = await pool.query('SELECT id FROM coach_profiles WHERE user_id = $1', [collegeCoachId]);
  if (collegeCoachExists.rows.length === 0) {
    await pool.query(
      `INSERT INTO coach_profiles (user_id, first_name, last_name, team_name, college_division, position_title,
       city, state, bio, username, conference)
       VALUES ($1, 'Sarah', 'Johnson', 'Colorado Buffaloes', 'D1 FBS', 'Recruiting Coordinator', 'Boulder', 'Colorado',
       'Passionate about finding the best talent and building winning programs.', 'coachjohnson', 'Big 12')`,
      [collegeCoachId]
    );
    console.log('  CREATED: College Coach profile (Sarah Johnson)');
  } else {
    console.log('  EXISTS: College Coach profile');
  }

  // Other profile
  const otherId = users['other@test.com'];
  const otherExists = await pool.query('SELECT id FROM other_profiles WHERE user_id = $1', [otherId]);
  if (otherExists.rows.length === 0) {
    await pool.query(
      `INSERT INTO other_profiles (user_id, first_name, last_name, subheader, bio, username)
       VALUES ($1, 'Robert', 'Thompson', 'Football Parent',
       'Proud football dad supporting my son''s recruiting journey.', 'robertthompson')`,
      [otherId]
    );
    console.log('  CREATED: Other profile (Robert Thompson)');
  } else {
    console.log('  EXISTS: Other profile');
  }
}

async function seedSubscriptions(users) {
  console.log('\n--- Seeding subscriptions for paid accounts ---\n');

  const paidAccounts = [
    { email: 'hsplayer@test.com', tier: 'player', subId: 'sub_mock_hsplayer', cusId: 'cus_mock_hsplayer' },
    { email: 'transferplayer@test.com', tier: 'player', subId: 'sub_mock_transferplayer', cusId: 'cus_mock_transferplayer' },
    { email: 'collegecoach@test.com', tier: 'pro', subId: 'sub_mock_collegecoach', cusId: 'cus_mock_collegecoach' }
  ];

  for (const acct of paidAccounts) {
    const userId = users[acct.email];
    if (!userId) continue;
    await pool.query(
      `UPDATE users SET subscription_status = 'active', subscription_tier = $1,
       stripe_subscription_id = $2, stripe_customer_id = $3,
       subscription_source = 'stripe'
       WHERE id = $4`,
      [acct.tier, acct.subId, acct.cusId, userId]
    );
    console.log(`  SET: ${acct.email} → tier=${acct.tier}, status=active`);
  }
}

async function seedFollows(users) {
  console.log('\n--- Seeding follow relationships ---\n');

  const followPairs = [
    ['hscoach@test.com', 'hsplayer@test.com'],
    ['collegecoach@test.com', 'hsplayer@test.com'],
    ['collegecoach@test.com', 'transferplayer@test.com'],
    ['other@test.com', 'hsplayer@test.com'],
    ['hsplayer@test.com', 'collegeplayer@test.com'],
  ];

  for (const [followerEmail, followingEmail] of followPairs) {
    const followerId = users[followerEmail];
    const followingId = users[followingEmail];

    const existing = await pool.query(
      'SELECT id FROM follows WHERE follower_id = $1 AND following_id = $2',
      [followerId, followingId]
    );

    if (existing.rows.length === 0) {
      await pool.query(
        'INSERT INTO follows (follower_id, following_id) VALUES ($1, $2)',
        [followerId, followingId]
      );
      console.log(`  CREATED: ${followerEmail} -> ${followingEmail}`);
    } else {
      console.log(`  EXISTS: ${followerEmail} -> ${followingEmail}`);
    }
  }
}

async function seedPosts(users) {
  console.log('\n--- Seeding posts ---\n');

  const posts = [
    { email: 'hsplayer@test.com', content: 'Just had a great practice today! Working on my deep ball accuracy. Can\'t wait for the season to start.' },
    { email: 'collegeplayer@test.com', content: 'Grateful for the opportunity to compete at the next level. Hard work pays off!' },
    { email: 'hscoach@test.com', content: 'Proud of our team\'s effort this week. These young men are putting in the work.' },
    { email: 'collegecoach@test.com', content: 'Looking for talented recruits to join our program. If you have the drive, we want to hear from you.' }
  ];

  for (const post of posts) {
    const userId = users[post.email];
    const existing = await pool.query(
      'SELECT id FROM posts WHERE user_id = $1 AND content = $2',
      [userId, post.content]
    );

    if (existing.rows.length === 0) {
      await pool.query(
        'INSERT INTO posts (user_id, content) VALUES ($1, $2)',
        [userId, post.content]
      );
      console.log(`  CREATED: Post by ${post.email}`);
    } else {
      console.log(`  EXISTS: Post by ${post.email}`);
    }
  }
}

async function seedConversation(users) {
  console.log('\n--- Seeding conversation ---\n');

  const coachId = users['collegecoach@test.com'];
  const playerId = users['hsplayer@test.com'];

  // Check if conversation already exists between these two
  const existing = await pool.query(
    `SELECT c.id FROM conversations c
     JOIN conversation_participants cp1 ON c.id = cp1.conversation_id AND cp1.user_id = $1
     JOIN conversation_participants cp2 ON c.id = cp2.conversation_id AND cp2.user_id = $2`,
    [coachId, playerId]
  );

  if (existing.rows.length > 0) {
    console.log('  EXISTS: Conversation between collegecoach and hsplayer');
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const convResult = await client.query(
      'INSERT INTO conversations (created_by) VALUES ($1) RETURNING id',
      [coachId]
    );
    const convId = convResult.rows[0].id;

    await client.query(
      'INSERT INTO conversation_participants (conversation_id, user_id) VALUES ($1, $2), ($1, $3)',
      [convId, coachId, playerId]
    );

    await client.query(
      'INSERT INTO messages (conversation_id, sender_id, content) VALUES ($1, $2, $3)',
      [convId, coachId, 'Hi Jake! I\'ve been watching your film and I\'m really impressed. Would love to chat about our program.']
    );

    await client.query(
      'INSERT INTO messages (conversation_id, sender_id, content) VALUES ($1, $2, $3)',
      [convId, playerId, 'Thank you Coach Johnson! I\'d love to learn more about Colorado. What makes your program special?']
    );

    await client.query('COMMIT');
    console.log('  CREATED: Conversation with 2 messages (collegecoach <-> hsplayer)');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('  ERROR: Failed to create conversation —', err.message);
  } finally {
    client.release();
  }
}

async function main() {
  console.log('===========================================');
  console.log('  Direct Recruit — Local Dev Database Seed');
  console.log('===========================================');
  console.log(`  Host: ${process.env.DB_HOST}:${process.env.DB_PORT}`);
  console.log(`  Database: ${process.env.DB_NAME}`);

  try {
    // Test connection
    await pool.query('SELECT 1');
    console.log('  Connection: OK\n');

    await runMigrations();
    await applyManualFixes();
    // Re-run migrations that depend on tables created by applyManualFixes
    await runMigrations();
    const users = await seedUsers();
    await seedProfiles(users);
    await seedSubscriptions(users);
    await seedFollows(users);
    await seedPosts(users);
    await seedConversation(users);

    console.log('\n===========================================');
    console.log('  Seed complete!');
    console.log('===========================================');
    console.log('\n  Test accounts (all use password: Test123!@#):');
    console.log('    hsplayer@test.com      — High School Player');
    console.log('    collegeplayer@test.com  — College Player');
    console.log('    transferplayer@test.com — Transfer Player');
    console.log('    hscoach@test.com        — High School Coach');
    console.log('    collegecoach@test.com   — College Coach');
    console.log('    other@test.com          — Other (Parent/Fan)');
    console.log('\n  Verification code for all flows: ' + (process.env.LOCAL_DEV_VERIFICATION_CODE || '123456'));
    console.log('');

  } catch (err) {
    console.error('\nFATAL:', err.message);
    console.error('Make sure PostgreSQL is running (docker-compose up -d) and .env is configured.\n');
  } finally {
    await pool.end();
  }
}

main();
