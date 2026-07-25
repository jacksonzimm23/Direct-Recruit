#!/usr/bin/env node
/**
 * seed-hsplayers.js
 *
 * Generates SQL for N randomized hsplayer test profiles per testing.md spec.
 * Outputs to stdout; redirect to a .sql file then pipe to psql.
 *
 * Usage:
 *   node backend/scripts/seed-hsplayers.js --count=500 > bulk-hsplayers.sql
 *
 * Each user wrapped in its own BEGIN/COMMIT so one bad row doesn't kill the batch.
 * Cleanup (any time, any environment):
 *   DELETE FROM users WHERE email LIKE 'randtest.%@test.com';
 */

const fs = require('fs');
const path = require('path');

// ─── ARGS ───────────────────────────────────────────────────────────────────
const args = process.argv.slice(2).reduce((acc, a) => {
  const m = a.match(/^--([^=]+)=(.+)$/);
  if (m) acc[m[1]] = m[2];
  return acc;
}, {});
const COUNT = parseInt(args.count || '500', 10);
if (!Number.isFinite(COUNT) || COUNT < 1) {
  console.error('Usage: node seed-hsplayers.js --count=N (N>=1)');
  process.exit(1);
}

// ─── RANDOMIZATION POOLS (testing.md) ────────────────────────────────────────
const FIRST_NAMES = [
  'Jake','Marcus','Tyler','Caleb','Ethan','Brandon','Devin','Carter','Elijah',
  'Mason','Logan','Hunter','Austin','Zane','Kai','Jordan','Luke','Blake','Ryder',
  'Gavin','Cole','Trey','Chase','Owen','Nolan','Dante','Jalen','Xavier','Isaiah','Silas'
];

const LAST_NAMES = [
  'Thompson','Martinez','Johnson','Williams','Brown','Davis','Miller','Wilson',
  'Anderson','Taylor','Reed','Carter','Mitchell','Harris','Clark','Lewis','Walker',
  'Hall','Young','King','Wright','Scott','Green','Baker','Adams','Nelson','Hill',
  'Ramirez','Campbell','Parker'
];

// Skip LS (no stats render) and ATH (not in POSITION_STATS) per testing.md
const POSITIONS = ['QB','RB','FB','WR','TE','OT','OG','C','DE','DT','NT','ILB','OLB','CB','S','K','P'];

// Position-realistic height/weight ranges per testing.md
const POSITION_PHYSICAL = {
  QB:  { hMin: 72, hMax: 77, wMin: 185, wMax: 225 },
  RB:  { hMin: 68, hMax: 74, wMin: 170, wMax: 215 },
  CB:  { hMin: 68, hMax: 74, wMin: 170, wMax: 215 },
  S:   { hMin: 68, hMax: 74, wMin: 170, wMax: 215 },
  WR:  { hMin: 70, hMax: 76, wMin: 170, wMax: 210 },
  TE:  { hMin: 74, hMax: 79, wMin: 220, wMax: 260 },
  FB:  { hMin: 71, hMax: 75, wMin: 210, wMax: 245 },
  ILB: { hMin: 71, hMax: 75, wMin: 210, wMax: 245 },
  OLB: { hMin: 71, hMax: 75, wMin: 210, wMax: 245 },
  OT:  { hMin: 74, hMax: 79, wMin: 270, wMax: 330 },
  OG:  { hMin: 74, hMax: 79, wMin: 270, wMax: 330 },
  C:   { hMin: 74, hMax: 79, wMin: 270, wMax: 330 },
  DE:  { hMin: 73, hMax: 78, wMin: 250, wMax: 320 },
  DT:  { hMin: 73, hMax: 78, wMin: 250, wMax: 320 },
  NT:  { hMin: 73, hMax: 78, wMin: 250, wMax: 320 },
  K:   { hMin: 68, hMax: 75, wMin: 160, wMax: 210 },
  P:   { hMin: 68, hMax: 75, wMin: 160, wMax: 210 }
};

// 30 cities matched to states (testing.md)
const CITY_STATE = [
  ['Austin','Texas'],['Dallas','Texas'],['Houston','Texas'],
  ['Denver','Colorado'],
  ['Atlanta','Georgia'],
  ['Miami','Florida'],['Tampa','Florida'],['Orlando','Florida'],
  ['Nashville','Tennessee'],['Memphis','Tennessee'],
  ['Charlotte','North Carolina'],['Raleigh','North Carolina'],
  ['Columbus','Ohio'],['Cleveland','Ohio'],['Cincinnati','Ohio'],
  ['Indianapolis','Indiana'],
  ['Phoenix','Arizona'],['Tucson','Arizona'],
  ['San Diego','California'],['Sacramento','California'],
  ['Portland','Oregon'],
  ['Seattle','Washington'],
  ['Boise','Idaho'],
  ['Omaha','Nebraska'],
  ['Des Moines','Iowa'],
  ['Minneapolis','Minnesota'],
  ['Milwaukee','Wisconsin'],
  ['Birmingham','Alabama'],['Mobile','Alabama'],
  ['New Orleans','Louisiana']
];

const SCHOOL_SUFFIXES = ['High School','Prep Academy','Catholic','Central','East','West','North','South','Classical','Christian'];

const BIOS = [
  'Two-time team captain. Grinding for a state title.',
  'Film junkie with all-conference honors. Always in the weight room.',
  'Built for Saturdays. Locked in on the season ahead.',
  'Day-one starter. Proud to wear the jersey.',
  'Physical, tone-setting mindset. Earning my role every week.',
  'Hard work, humble heart. Focused on the team.',
  'Three-sport athlete who finally chose football. All in.'
];

const OPPONENT_POOL = [
  'Lincoln High','Denver Central','Westlake Academy','Plano East','Cedar Ridge',
  'Frisco Prep','Highland Park','Round Rock','Katy Tompkins','Allen',
  'Southlake Carroll','North Shore','DeSoto','Duncanville','Mansfield Lake Ridge'
];

const PERMISSIONS = ['everyone','followers','nobody'];
const PLAYER_STATUS = ['freshman','sophomore','junior','senior'];

// Note: password_hash column was dropped from prod when auth moved to Cognito-only.
// Local still has it (defaults to NULL), prod doesn't have it at all. We omit it from
// the INSERT so the same SQL runs on both. Testers won't sign in as these users anyway.

// ─── LOAD SCHOOL LOGOS ──────────────────────────────────────────────────────
const LOGOS_PATH = path.join(__dirname, '..', '..', 'frontend', 'assets', 'school-logos.json');
const schoolLogos = JSON.parse(fs.readFileSync(LOGOS_PATH, 'utf-8'));
// Per testing.md: only schools with real logo files, exclude NAIA/NJCAA
const ELIGIBLE_SCHOOLS = Object.entries(schoolLogos)
  .filter(([_, m]) => m.logo && ['D1 FBS','D1 FCS','D2','D3'].includes(m.division))
  .map(([name, m]) => ({ name, division: m.division }));
if (ELIGIBLE_SCHOOLS.length === 0) {
  console.error('FATAL: no eligible schools loaded from', LOGOS_PATH);
  process.exit(1);
}

// ─── RANDOM HELPERS ─────────────────────────────────────────────────────────
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const randFloat = (min, max, decimals = 2) => parseFloat((Math.random() * (max - min) + min).toFixed(decimals));
const usedEmails = new Set();
const usedUsernames = new Set();

function uniqueUsername(first, last) {
  let u;
  do { u = (first + last + randInt(0, 9999)).toLowerCase(); } while (usedUsernames.has(u));
  usedUsernames.add(u);
  return u;
}
function uniqueEmail(first, last) {
  let e;
  do { e = `randtest.${first.toLowerCase()}.${last.toLowerCase()}.${randInt(0, 99999)}@test.com`; } while (usedEmails.has(e));
  usedEmails.add(e);
  return e;
}

// SQL string escaping — single quotes -> doubled single quotes
const sq = (s) => "'" + String(s).replace(/'/g, "''") + "'";
const sqOrNull = (s) => (s === null || s === undefined) ? 'NULL' : sq(s);

// ─── OFFER COUNT BY STAR RATING (testing.md) ────────────────────────────────
function offerCountForStars(stars) {
  switch (stars) {
    case 1: return randInt(0, 2);
    case 2: return randInt(2, 5);
    case 3: return randInt(5, 10);
    case 4: return randInt(10, 20);
    case 5: return randInt(15, 30);
    default: return randInt(5, 10);
  }
}

function pickOffers(count) {
  if (count === 0) return null;
  const used = new Set();
  const picks = [];
  let attempts = 0;
  while (picks.length < count && attempts < count * 5) {
    const s = pick(ELIGIBLE_SCHOOLS);
    if (!used.has(s.name)) { used.add(s.name); picks.push(s); }
    attempts++;
  }
  return picks.map(s => `${s.name}, ${s.division}`).join('|');
}

// ─── POSITION-SPECIFIC GAME STATS (testing.md) ──────────────────────────────
function gameStatsJsonb(position) {
  switch (position) {
    case 'QB':
      return `jsonb_build_object('pass_yds', ${randInt(120,370)}, 'pass_tds', ${randInt(0,4)}, 'rush_yds', ${randInt(0,120)}, 'rush_tds', ${randInt(0,2)}, 'ints', ${randInt(0,2)}, 'comp_%', ${randFloat(50.0,80.0,1)})`;
    case 'RB':
    case 'FB':
      return `jsonb_build_object('rush_yds', ${randInt(30,200)}, 'rush_tds', ${randInt(0,3)}, 'rec', ${randInt(0,5)}, 'rec_yds', ${randInt(0,60)}, 'rec_tds', ${randInt(0,1)})`;
    case 'WR':
      return `jsonb_build_object('rec', ${randInt(1,10)}, 'rec_yds', ${randInt(20,180)}, 'rec_tds', ${randInt(0,3)})`;
    case 'TE':
      return `jsonb_build_object('rec', ${randInt(1,7)}, 'rec_yds', ${randInt(10,110)}, 'rec_tds', ${randInt(0,2)})`;
    case 'DE':
    case 'DT':
    case 'NT':
      return `jsonb_build_object('tackles', ${randInt(1,8)}, 'tfls', ${randInt(0,3)}, 'sacks', ${randInt(0,2)}, 'pbu', ${randInt(0,1)}, 'ff', ${randInt(0,1)})`;
    case 'ILB':
    case 'OLB':
      return `jsonb_build_object('tackles', ${randInt(3,14)}, 'tfls', ${randInt(0,3)}, 'sacks', ${randInt(0,2)}, 'ff', ${randInt(0,1)}, 'int', ${randInt(0,1)}, 'pbu', ${randInt(0,2)})`;
    case 'CB':
    case 'S':
      return `jsonb_build_object('tackles', ${randInt(1,10)}, 'int', ${randInt(0,2)}, 'pbu', ${randInt(0,3)})`;
    case 'K': {
      const att = randInt(0,5);
      const m = att === 0 ? 0 : randInt(0, att);
      return `jsonb_build_object('att', ${att}, 'm', ${m}, 'blk', ${randInt(0,1)}, 'long', ${randInt(25,55)}, 'pats', ${randInt(0,6)})`;
    }
    case 'P':
      return `jsonb_build_object('att', ${randInt(1,8)}, 'long', ${randInt(35,70)}, 'avg', ${randFloat(32.0,48.0,1)}, 'tb', ${randInt(0,2)}, 'fc', ${randInt(0,3)}, 'i20', ${randInt(0,3)}, '50+', ${randInt(0,2)}, 'blk', ${randInt(0,1)})`;
    default:
      return null; // OT/OG/C/LS — no stats row inserted
  }
}

// ─── SUMMARY-STAT INTEGER COLUMNS (display only) ────────────────────────────
// Prod schema has these as integer (local has varchar — drift). Emit plain numbers;
// the frontend renders "<num> yds" / "<num> TDs" etc. on its own.
function summaryStats() {
  return {
    last1: randInt(0,2999),
    last2: randInt(0,39),
    last3: randInt(0,59),
    car1:  randInt(0,7999),
    car2:  randInt(0,99),
    car3:  randInt(0,149)
  };
}

// ─── ONE USER'S SQL BLOCK ───────────────────────────────────────────────────
function emitUser() {
  const first = pick(FIRST_NAMES);
  const last  = pick(LAST_NAMES);
  const username = uniqueUsername(first, last);
  const email = uniqueEmail(first, last);
  const position = pick(POSITIONS);
  const physical = POSITION_PHYSICAL[position];
  const height = randInt(physical.hMin, physical.hMax);
  const weight = randInt(physical.wMin, physical.wMax);
  const stars = randInt(1, 5);
  const offerCount = offerCountForStars(stars);
  const offers = pickOffers(offerCount);
  const [city, state] = pick(CITY_STATE);
  const teamName = `${city} ${pick(SCHOOL_SUFFIXES)}`;
  const gradYear = randInt(2026, 2029);
  const seasonYear = gradYear - 1;
  // DOB: 16-19 years ago
  const dobAge = randInt(16, 19);
  const dob = new Date();
  dob.setFullYear(dob.getFullYear() - dobAge);
  dob.setMonth(randInt(0, 11));
  dob.setDate(randInt(1, 28));
  const dobStr = dob.toISOString().slice(0, 10);
  const gpa = randFloat(2.00, 4.00, 2);
  const satScore = randInt(1000, 1599);
  const actScore = randInt(18, 35);
  const ccViews = randInt(0, 499);
  const followers = randInt(0, 199);
  const following = randInt(0, 149);
  const bio = pick(BIOS);
  const status = pick(PLAYER_STATUS);
  const number = randInt(0, 98);
  const phone = `555-${String(randInt(0,999)).padStart(3,'0')}-${String(randInt(0,9999)).padStart(4,'0')}`;
  const msgPerm = pick(PERMISSIONS);
  const visPerm = pick(PERMISSIONS);
  const stats = summaryStats();
  // No Stripe ids seeded: players are free on the platform (2026-07) and a
  // subscription only unlocks AI Rep. randtest accounts represent typical FREE users.

  // Build the 10-game CTE chain
  // Season runs Aug-Nov of (gradYear - 2) per testing.md
  const seasonStartYear = gradYear - 2;
  const gameDates = [];
  let d = new Date(`${seasonStartYear}-08-29`);
  for (let i = 0; i < 10; i++) {
    gameDates.push(new Date(d));
    d.setDate(d.getDate() + 7);
  }

  // Skip stat rows for OT/OG/C (testing.md). LS already skipped from POSITIONS.
  const insertsStats = !['OT','OG','C'].includes(position);

  const gameCtes = gameDates.map((dt, i) => {
    const dateStr = dt.toISOString().slice(0,10);
    const opponent = pick(OPPONENT_POOL);
    const myScore = randInt(7, 49);
    const theirScore = randInt(0, 42);
    const result = `${myScore > theirScore ? 'W' : 'L'} ${myScore}-${theirScore}`;
    return `g${i+1} AS (INSERT INTO player_games (player_id, game_date, season_year, opponent, result) SELECT id, DATE ${sq(dateStr)}, ${seasonYear}, ${sq(opponent)}, ${sq(result)} FROM new_profile RETURNING id, player_id)`;
  });

  const highlightCtes = [
    `hl1 AS (INSERT INTO player_highlights (user_id, highlight_type, title, hudl_link, video_url) SELECT user_id, 'junior', 'Junior Season Highlights', ${sq(`https://hudl.com/v/${username}/junior`)}, NULL FROM new_profile RETURNING id)`,
    `hl2 AS (INSERT INTO player_highlights (user_id, highlight_type, title, hudl_link, video_url) SELECT user_id, 'sophomore', 'Sophomore Season Highlights', ${sq(`https://hudl.com/v/${username}/sophomore`)}, NULL FROM new_profile RETURNING id)`
  ];

  let statCtes = [];
  let finalInsert = '';
  if (insertsStats) {
    // 9 stat CTEs then a final non-CTE INSERT
    for (let i = 0; i < 9; i++) {
      const statsJsonb = gameStatsJsonb(position);
      statCtes.push(`gs${i+1} AS (INSERT INTO player_game_stats (game_id, position, stats, player_name, user_id) SELECT g${i+1}.id, ${sq(position)}, ${statsJsonb}, ${sq(first + ' ' + last)}, np.user_id FROM g${i+1}, new_profile np RETURNING id)`);
    }
    const lastJsonb = gameStatsJsonb(position);
    finalInsert = `INSERT INTO player_game_stats (game_id, position, stats, player_name, user_id) SELECT g10.id, ${sq(position)}, ${lastJsonb}, ${sq(first + ' ' + last)}, np.user_id FROM g10, new_profile np;`;
  } else {
    // OT/OG/C: games but no stats. Need a final non-CTE statement to anchor the WITH chain.
    // Use a no-op SELECT 1 since CTE chain must end with a regular DML/SELECT.
    finalInsert = `SELECT 1;`;
  }

  const allCtes = [
    `new_user AS (
  INSERT INTO users (id, email, role, email_verified, profile_completed, is_active, cognito_sub, username, subscription_status, subscription_tier, stripe_customer_id, stripe_subscription_id)
  VALUES (uuid_generate_v4(), ${sq(email)}, 'player', true, true, true, 'randtest-' || gen_random_uuid()::text, ${sq(username)}, 'none', NULL, NULL, NULL)
  RETURNING id
)`,
    `new_profile AS (
  INSERT INTO player_profiles (user_id, first_name, last_name, date_of_birth, team_name, graduation_year, city, state, height, weight, gpa, sat_score, act_score, bio, phone, hudl_profile, twitter_handle, instagram_handle, player_status, username, cc_views, college_division, transfer, eligibility, number, conference, offers, star_rating, followers_count, following_count, message_permissions, profile_visibility, position, lastseasonstat1, lastseasonstat2, lastseasonstat3, careerstat1, careerstat2, careerstat3)
  SELECT nu.id, ${sq(first)}, ${sq(last)}, DATE ${sq(dobStr)}, ${sq(teamName)}, ${gradYear}, ${sq(city)}, ${sq(state)}, ${height}, ${weight}, ${gpa}, ${satScore}, ${actScore}, ${sq(bio)}, ${sq(phone)}, ${sq(`https://hudl.com/profile/${username}`)}, ${sq('@'+username)}, ${sq('@'+username)}, ${sq(status)}, ${sq(username)}, ${ccViews}, NULL, 'no', 4, ${number}, NULL, ${sqOrNull(offers)}, ${stars}, ${followers}, ${following}, ${sq(msgPerm)}, ${sq(visPerm)}, ${sq(position)}, ${stats.last1}, ${stats.last2}, ${stats.last3}, ${stats.car1}, ${stats.car2}, ${stats.car3}
  FROM new_user nu RETURNING id, user_id
)`,
    ...gameCtes,
    ...highlightCtes,
    ...statCtes
  ].join(',\n');

  return `BEGIN;\nWITH ${allCtes}\n${finalInsert}\nCOMMIT;\n`;
}

// ─── EMIT ───────────────────────────────────────────────────────────────────
const out = [];
out.push('-- Auto-generated by seed-hsplayers.js');
out.push(`-- Count: ${COUNT} hsplayers`);
out.push(`-- Generated: ${new Date().toISOString()}`);
out.push('-- Cleanup: DELETE FROM users WHERE email LIKE \'randtest.%@test.com\';');
out.push('');
for (let i = 0; i < COUNT; i++) {
  out.push(emitUser());
}
process.stdout.write(out.join('\n'));
console.error(`[seed-hsplayers] emitted ${COUNT} users`);
