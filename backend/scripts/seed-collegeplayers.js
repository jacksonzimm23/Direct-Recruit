#!/usr/bin/env node
/**
 * seed-collegeplayers.js
 *
 * Generates SQL for N randomized collegeplayer test profiles per testing.md.
 * Outputs to stdout; redirect to a .sql file then pipe to psql.
 *
 * Usage:
 *   node backend/scripts/seed-collegeplayers.js --count=300 > bulk-collegeplayers.sql
 *
 * Key differences from hsplayer (testing.md collegeplayer section):
 *   * college_division = real division of team_name (D1 FBS/FCS/D2/D3)
 *   * transfer = 'no' (literal lowercase)
 *   * team_name matches school-logos.json key exactly
 *   * city/state = school location (we use a college-town pool, plausible labels)
 *   * conference set per division (free-text)
 *   * offers = NULL (already committed)
 *   * sat_score / act_score = NULL (not captured on college form)
 *   * subscription_* all NULL/'none' (free role, no Stripe)
 *   * 10 player_games rows + 10 player_game_stats rows (same as hsplayer)
 *   * PI signal mix:
 *       ~20% portal_keywords (bio contains 2-3 portal keywords)
 *       ~10% bio_and_film (recent updated_at + recent highlight uploaded)
 *       ~70% stable (no signal — backdated updated_at outside 14-day lookback)
 *   * browsing_coaches signal NOT emitted (would require pre-existing coach_profile_views rows;
 *     can backfill later when real coaches accumulate)
 *
 * Important — `updated_at` trigger workaround:
 *   The `update_player_profiles_updated_at` trigger fires on every UPDATE, including our
 *   own backdate UPDATE. To bypass it cleanly, we backdate `updated_at` via a direct
 *   UPDATE that immediately follows the INSERT in the same transaction. The trigger will
 *   bump updated_at to NOW() on that UPDATE, BUT we then run an additional unconditional
 *   UPDATE with the desired timestamp wrapped in `pg_temp.set_updated_at()` — see below.
 *   Actually the simplest path is: temporarily disable the trigger for the session using
 *   `session_replication_role = replica`, but that requires superuser on RDS.
 *
 *   Practical alternative: emit one big UPDATE per batch at the END of the script that
 *   sets `updated_at` for each user directly. The trigger fires once per UPDATE, but we
 *   issue the UPDATE inside an `UPDATE ... SET ..., updated_at = ...` that explicitly
 *   includes updated_at AFTER all other writes. The trigger function is BEFORE UPDATE
 *   so it sets NEW.updated_at = CURRENT_TIMESTAMP, BUT some implementations let you
 *   override by setting updated_at explicitly in the UPDATE statement. Let's check:
 *   the default trigger function is `update_updated_at_column()` which unconditionally
 *   does `NEW.updated_at = CURRENT_TIMESTAMP`. So we CAN'T override.
 *
 *   Final approach used here: each user's COMMIT block ends with a direct UPDATE that
 *   temporarily uses `ALTER TABLE ... DISABLE TRIGGER` only via SQL function call. But
 *   on RDS we may not have that privilege either. We try this approach and if it fails,
 *   fall back to leaving updated_at at NOW() for all (PI will rank by created_at order
 *   instead since the field is the same).
 *
 *   ACTUAL CHOSEN APPROACH (works on RDS with no special privileges):
 *   Wrap the backdate in a `WITH ... UPDATE ...` then `UPDATE WHERE updated_at >= ...`
 *   that uses a CTE to bypass the trigger? No — triggers fire on any UPDATE regardless
 *   of CTE. The only RDS-safe option is to run the entire INSERT block, then accept
 *   that updated_at will be CURRENT_TIMESTAMP for everyone. The script BELOW emits the
 *   intent (UPDATE with backdate) — if the trigger overrides, PI will rank everyone
 *   by insert order which is still acceptable for demos.
 *
 *   The KEY signal logic for PI is the bio keywords. Those are unaffected by updated_at.
 *   The bio_and_film signal does depend on updated_at being recent, but since the trigger
 *   will set NEW.updated_at = NOW() on every UPDATE, all test users will have recent
 *   updated_at, which means ALL test users with non-empty bio + recent highlight WILL
 *   trigger bio_and_film. That's not 10% — that's 100%.
 *
 *   To get ~10% bio_and_film instead of 100%, we omit the highlight INSERT for the
 *   ~90% who shouldn't have the bio_and_film signal. Players without recent highlights
 *   simply have no highlight rows — that's fine for the test cohort. Real coaches
 *   browsing Discover won't be looking at highlight counts.
 *
 * Cleanup: DELETE FROM users WHERE email LIKE 'randtest.%@test.com';
 */

const fs = require('fs');
const path = require('path');

// ─── ARGS ───────────────────────────────────────────────────────────────────
const args = process.argv.slice(2).reduce((acc, a) => {
  const m = a.match(/^--([^=]+)=(.+)$/);
  if (m) acc[m[1]] = m[2];
  return acc;
}, {});
const COUNT = parseInt(args.count || '300', 10);
if (!Number.isFinite(COUNT) || COUNT < 1) {
  console.error('Usage: node seed-collegeplayers.js --count=N (N>=1)');
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

const POSITIONS = ['QB','RB','FB','WR','TE','OT','OG','C','DE','DT','NT','ILB','OLB','CB','S','K','P'];

// Position-realistic ranges — college-tighter per testing.md note
const POSITION_PHYSICAL = {
  QB:  { hMin: 73, hMax: 77, wMin: 195, wMax: 230 },
  RB:  { hMin: 69, hMax: 74, wMin: 180, wMax: 220 },
  CB:  { hMin: 69, hMax: 74, wMin: 180, wMax: 215 },
  S:   { hMin: 71, hMax: 75, wMin: 185, wMax: 220 },
  WR:  { hMin: 71, hMax: 76, wMin: 175, wMax: 215 },
  TE:  { hMin: 75, hMax: 79, wMin: 230, wMax: 265 },
  FB:  { hMin: 72, hMax: 75, wMin: 225, wMax: 255 },
  ILB: { hMin: 72, hMax: 75, wMin: 225, wMax: 250 },
  OLB: { hMin: 72, hMax: 75, wMin: 225, wMax: 250 },
  OT:  { hMin: 76, hMax: 80, wMin: 285, wMax: 335 },
  OG:  { hMin: 75, hMax: 79, wMin: 290, wMax: 335 },
  C:   { hMin: 74, hMax: 78, wMin: 285, wMax: 320 },
  DE:  { hMin: 74, hMax: 78, wMin: 255, wMax: 290 },
  DT:  { hMin: 74, hMax: 78, wMin: 280, wMax: 325 },
  NT:  { hMin: 73, hMax: 77, wMin: 295, wMax: 330 },
  K:   { hMin: 70, hMax: 75, wMin: 170, wMax: 210 },
  P:   { hMin: 71, hMax: 76, wMin: 180, wMax: 220 }
};

const CONFERENCES = {
  'D1 FBS': ['SEC','Big Ten','ACC','Big 12','Pac-12','AAC','Mountain West','C-USA','MAC','Sun Belt'],
  'D1 FCS': ['CAA','Big Sky','MVFC','Patriot League','Southern','Southland','Ivy League','MEAC','SWAC','OVC'],
  'D2':     ['GLIAC','PSAC','GLVC','SAC','GAC','NSIC','CIAA','GNAC','MIAA','Lone Star'],
  'D3':     ['OAC','WIAC','MIAC','NWC','SCIAC','CCIW','NJAC','ODAC','NESCAC','Liberty League']
};

// Portal-signaling bios (each hits 2-3 keywords from the PI list). Keep short + natural.
const SIGNALING_BIOS = [
  'Weighing my options. Open to the transfer portal for the right fit.',
  'Exploring options for next year. Ready for change.',
  'Looking for a new home. Grad transfer with immediate eligibility.',
  'New chapter ahead. Considering my options.',
  'Open to opportunities. Focused on the next step.',
  'Entering the portal and seeking the right program.',
  'Grad transfer. Ready for a new beginning.',
  'Moving on. Exploring my options for the right fit.'
];

// Stable bios — checked manually to contain ZERO of the 29 PI keywords.
// Avoid: transfer, portal, eligible, eligibility, looking for new opportunity,
// open to opportunities, exploring options, new chapter, fresh start, available,
// seeking, next step, ready for change, new home, looking to transfer,
// entering the portal, committed to growth, open to new, exploring my options,
// new beginning, moving on, ready for a new, weighing my options,
// considering my options, in the portal, portal entry, immediate eligibility,
// grad transfer, one time transfer
const STABLE_BIOS = [
  'Team captain. Business major. Day-one starter.',
  'Proud to wear the jersey. Leader in the locker room.',
  'Grinding for a conference title.',
  'Film junkie. All-conference honors last year.',
  'Built for Saturdays. Locked in on the season ahead.',
  'Hard work, humble heart. Focused on the team.',
  'Physical, tone-setting mindset. Earning my role every week.'
];

const PERMISSIONS = ['everyone','followers','nobody'];
const PLAYER_STATUS = ['freshman','sophomore','junior','senior'];

// ─── LOAD SCHOOL LOGOS + COLLEGE CITIES ─────────────────────────────────────
const LOGOS_PATH = path.join(__dirname, '..', '..', 'frontend', 'assets', 'school-logos.json');
const schoolLogos = JSON.parse(fs.readFileSync(LOGOS_PATH, 'utf-8'));
const ELIGIBLE_SCHOOLS = Object.entries(schoolLogos)
  .filter(([_, m]) => m.logo && ['D1 FBS','D1 FCS','D2','D3'].includes(m.division))
  .map(([name, m]) => ({ name, division: m.division }));

// College-town city/state pool (plausible labels — doesn't strictly match the picked school)
const COLLEGE_CITY_STATE = [
  ['Tuscaloosa','Alabama'],['Auburn','Alabama'],['Athens','Georgia'],['Tallahassee','Florida'],
  ['Gainesville','Florida'],['Knoxville','Tennessee'],['Lexington','Kentucky'],['Columbia','South Carolina'],
  ['Fayetteville','Arkansas'],['College Station','Texas'],['Austin','Texas'],['Lubbock','Texas'],
  ['Norman','Oklahoma'],['Stillwater','Oklahoma'],['Manhattan','Kansas'],['Lincoln','Nebraska'],
  ['Ames','Iowa'],['Iowa City','Iowa'],['Madison','Wisconsin'],['Ann Arbor','Michigan'],
  ['East Lansing','Michigan'],['Columbus','Ohio'],['Bloomington','Indiana'],['West Lafayette','Indiana'],
  ['Evanston','Illinois'],['Champaign','Illinois'],['Minneapolis','Minnesota'],['State College','Pennsylvania'],
  ['Pittsburgh','Pennsylvania'],['Newark','New Jersey'],['College Park','Maryland'],['Boston','Massachusetts'],
  ['Syracuse','New York'],['Ithaca','New York'],['Hanover','New Hampshire'],['Providence','Rhode Island'],
  ['New Haven','Connecticut'],['Princeton','New Jersey'],['Philadelphia','Pennsylvania'],['Charlottesville','Virginia'],
  ['Blacksburg','Virginia'],['Durham','North Carolina'],['Chapel Hill','North Carolina'],['Raleigh','North Carolina'],
  ['Clemson','South Carolina'],['Atlanta','Georgia'],['Miami','Florida'],['Coral Gables','Florida'],
  ['Tampa','Florida'],['Orlando','Florida'],['Boulder','Colorado'],['Fort Collins','Colorado'],
  ['Logan','Utah'],['Provo','Utah'],['Boise','Idaho'],['Pullman','Washington'],['Seattle','Washington'],
  ['Eugene','Oregon'],['Corvallis','Oregon'],['Stanford','California'],['Berkeley','California'],
  ['Los Angeles','California'],['Pasadena','California'],['Tempe','Arizona'],['Tucson','Arizona']
];

// Opponent pool — generic college-style names
const OPPONENT_POOL = [
  'Penn State','Pittsburgh','Kansas','Oklahoma State','Iowa State','Houston','TCU','Cincinnati',
  'Baylor','Texas Tech','UCF','BYU','Colorado','Utah','Arizona','Oregon State','Washington State',
  'Boise State','Air Force','Wyoming','Nevada','San Diego State','Tulane','SMU','Memphis',
  'Navy','Army','Wake Forest','NC State','Duke','Boston College','Pittsburgh State','Slippery Rock'
];

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

const sq = (s) => "'" + String(s).replace(/'/g, "''") + "'";

// ─── POSITION-SPECIFIC GAME STATS (same as hsplayer per testing.md) ─────────
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
    case 'DE': case 'DT': case 'NT':
      return `jsonb_build_object('tackles', ${randInt(1,8)}, 'tfls', ${randInt(0,3)}, 'sacks', ${randInt(0,2)}, 'pbu', ${randInt(0,1)}, 'ff', ${randInt(0,1)})`;
    case 'ILB': case 'OLB':
      return `jsonb_build_object('tackles', ${randInt(3,14)}, 'tfls', ${randInt(0,3)}, 'sacks', ${randInt(0,2)}, 'ff', ${randInt(0,1)}, 'int', ${randInt(0,1)}, 'pbu', ${randInt(0,2)})`;
    case 'CB': case 'S':
      return `jsonb_build_object('tackles', ${randInt(1,10)}, 'int', ${randInt(0,2)}, 'pbu', ${randInt(0,3)})`;
    case 'K': {
      const att = randInt(0,5);
      const m = att === 0 ? 0 : randInt(0, att);
      return `jsonb_build_object('att', ${att}, 'm', ${m}, 'blk', ${randInt(0,1)}, 'long', ${randInt(25,55)}, 'pats', ${randInt(0,6)})`;
    }
    case 'P':
      return `jsonb_build_object('att', ${randInt(1,8)}, 'long', ${randInt(35,70)}, 'avg', ${randFloat(32.0,48.0,1)}, 'tb', ${randInt(0,2)}, 'fc', ${randInt(0,3)}, 'i20', ${randInt(0,3)}, '50+', ${randInt(0,2)}, 'blk', ${randInt(0,1)})`;
    default:
      return null; // OT/OG/C/LS
  }
}

// ─── ONE USER'S SQL BLOCK ───────────────────────────────────────────────────
function emitUser(userIdx) {
  const first = pick(FIRST_NAMES);
  const last  = pick(LAST_NAMES);
  const username = uniqueUsername(first, last);
  const email = uniqueEmail(first, last);
  const position = pick(POSITIONS);
  const physical = POSITION_PHYSICAL[position];
  const height = randInt(physical.hMin, physical.hMax);
  const weight = randInt(physical.wMin, physical.wMax);

  const school = pick(ELIGIBLE_SCHOOLS);
  const teamName = school.name;
  const collegeDiv = school.division;
  const conference = pick(CONFERENCES[collegeDiv]);
  const [city, state] = pick(COLLEGE_CITY_STATE);

  // PI signal selection: roll once per user
  //   0-19  (20%): portal_keywords (signaling bio)
  //   20-29 (10%): bio_and_film    (stable bio + recent highlights, so bio_and_film fires but portal_keywords does NOT)
  //   30-99 (70%): stable          (stable bio, no recent highlights so bio_and_film does NOT fire either)
  const roll = randInt(0, 99);
  let signalType;
  let bio;
  let includeHighlights;
  if (roll < 20) {
    signalType = 'portal_keywords';
    bio = pick(SIGNALING_BIOS);
    includeHighlights = true; // doesn't matter for portal_keywords signal but realistic
  } else if (roll < 30) {
    signalType = 'bio_and_film';
    bio = pick(STABLE_BIOS);
    includeHighlights = true; // required to trigger bio_and_film
  } else {
    signalType = 'stable';
    bio = pick(STABLE_BIOS);
    includeHighlights = false; // omit highlights so bio_and_film doesn't fire
  }

  const eligibility = randInt(1, 4);
  const gradYear = randInt(2026, 2028);
  const seasonYear = gradYear - 1;
  const seasonStartYear = gradYear - 2;

  // DOB: 19-22 years ago
  const dobAge = randInt(19, 22);
  const dob = new Date();
  dob.setFullYear(dob.getFullYear() - dobAge);
  dob.setMonth(randInt(0, 11));
  dob.setDate(randInt(1, 28));
  const dobStr = dob.toISOString().slice(0, 10);

  const gpa = randFloat(2.50, 4.00, 2);
  const starRating = randInt(3, 5); // college range
  // PFF grade — realistic spread. Most cluster 60-85, ~10% above 85, ~15% below 60.
  // ~8% NULL (no grade on file) to exercise the "exclude ungraded players" filter.
  const pffRoll = randInt(0, 99);
  let pffGrade;
  if (pffRoll < 8)        pffGrade = 'NULL';
  else if (pffRoll < 23)  pffGrade = randFloat(45.0, 60.0, 1); // below-average tier
  else if (pffRoll < 60)  pffGrade = randFloat(60.0, 75.0, 1); // average to above-average
  else if (pffRoll < 90)  pffGrade = randFloat(75.0, 85.0, 1); // high tier
  else                    pffGrade = randFloat(85.0, 95.0, 1); // elite tier
  const ccViews = randInt(0, 1499);
  const followers = randInt(0, 799);
  const following = randInt(0, 399);
  const status = pick(PLAYER_STATUS);
  const number = randInt(0, 98);
  const phone = `555-${String(randInt(0,999)).padStart(3,'0')}-${String(randInt(0,9999)).padStart(4,'0')}`;
  const msgPerm = pick(PERMISSIONS);
  const visPerm = pick(PERMISSIONS);

  // Summary stat integer fields (display only; frontend reads jsonb stats anyway)
  const sumLast1 = randInt(0, 2999);
  const sumLast2 = randInt(0, 39);
  const sumLast3 = randInt(0, 59);
  const sumCar1 = randInt(0, 7999);
  const sumCar2 = randInt(0, 99);
  const sumCar3 = randInt(0, 149);

  // Build 10 game dates Aug-Nov of seasonStartYear
  const gameDates = [];
  let d = new Date(`${seasonStartYear}-08-30`);
  for (let i = 0; i < 10; i++) {
    gameDates.push(new Date(d));
    d.setDate(d.getDate() + 7);
  }

  const insertsStats = !['OT','OG','C'].includes(position);

  // ─── CTE chain ───
  const userCte = `new_user AS (
  INSERT INTO users (id, email, role, email_verified, profile_completed, is_active, cognito_sub, username, subscription_status, subscription_tier, stripe_customer_id, stripe_subscription_id)
  VALUES (uuid_generate_v4(), ${sq(email)}, 'player', true, true, true, 'randtest-' || gen_random_uuid()::text, ${sq(username)}, 'none', NULL, NULL, NULL)
  RETURNING id
)`;

  const profileCte = `new_profile AS (
  INSERT INTO player_profiles (user_id, first_name, last_name, date_of_birth, team_name, graduation_year, city, state, height, weight, gpa, sat_score, act_score, bio, phone, hudl_profile, twitter_handle, instagram_handle, player_status, username, cc_views, college_division, transfer, eligibility, number, conference, offers, star_rating, followers_count, following_count, message_permissions, profile_visibility, position, lastseasonstat1, lastseasonstat2, lastseasonstat3, careerstat1, careerstat2, careerstat3, pff_grade)
  SELECT nu.id, ${sq(first)}, ${sq(last)}, DATE ${sq(dobStr)}, ${sq(teamName)}, ${gradYear}, ${sq(city)}, ${sq(state)}, ${height}, ${weight}, ${gpa}, NULL, NULL, ${sq(bio)}, ${sq(phone)}, ${sq(`https://hudl.com/profile/${username}`)}, ${sq('@'+username)}, ${sq('@'+username)}, ${sq(status)}, ${sq(username)}, ${ccViews}, ${sq(collegeDiv)}, 'no', ${eligibility}, ${number}, ${sq(conference)}, NULL, ${starRating}, ${followers}, ${following}, ${sq(msgPerm)}, ${sq(visPerm)}, ${sq(position)}, ${sumLast1}, ${sumLast2}, ${sumLast3}, ${sumCar1}, ${sumCar2}, ${sumCar3}, ${pffGrade}
  FROM new_user nu RETURNING id, user_id
)`;

  const gameCtes = gameDates.map((dt, i) => {
    const dateStr = dt.toISOString().slice(0,10);
    const opponent = pick(OPPONENT_POOL);
    const myScore = randInt(7, 49);
    const theirScore = randInt(0, 42);
    const result = `${myScore > theirScore ? 'W' : 'L'} ${myScore}-${theirScore}`;
    return `g${i+1} AS (INSERT INTO player_games (player_id, game_date, season_year, opponent, result) SELECT id, DATE ${sq(dateStr)}, ${seasonYear}, ${sq(opponent)}, ${sq(result)} FROM new_profile RETURNING id, player_id)`;
  });

  // Highlights — only insert if signaling bio_and_film OR portal_keywords; skip for stable
  // (We could also include for stable, but omitting keeps bio_and_film from firing on
  // stable players whose updated_at will be NOW() because of the BEFORE-UPDATE trigger.)
  const highlightCtes = includeHighlights ? [
    `hl1 AS (INSERT INTO player_highlights (user_id, highlight_type, title, hudl_link, video_url) SELECT user_id, 'sophomore', 'Sophomore Season Highlights', ${sq(`https://hudl.com/v/${username}/sophomore`)}, NULL FROM new_profile RETURNING id)`,
    `hl2 AS (INSERT INTO player_highlights (user_id, highlight_type, title, hudl_link, video_url) SELECT user_id, 'junior', 'Junior Season Highlights', ${sq(`https://hudl.com/v/${username}/junior`)}, NULL FROM new_profile RETURNING id)`
  ] : [];

  let statCtes = [];
  let finalInsert = '';
  if (insertsStats) {
    for (let i = 0; i < 9; i++) {
      statCtes.push(`gs${i+1} AS (INSERT INTO player_game_stats (game_id, position, stats, player_name, user_id) SELECT g${i+1}.id, ${sq(position)}, ${gameStatsJsonb(position)}, ${sq(first + ' ' + last)}, np.user_id FROM g${i+1}, new_profile np RETURNING id)`);
    }
    finalInsert = `INSERT INTO player_game_stats (game_id, position, stats, player_name, user_id) SELECT g10.id, ${sq(position)}, ${gameStatsJsonb(position)}, ${sq(first + ' ' + last)}, np.user_id FROM g10, new_profile np;`;
  } else {
    // OT/OG/C: games but no stats. CTE chain needs a terminating statement.
    finalInsert = `SELECT 1;`;
  }

  const allCtes = [userCte, profileCte, ...gameCtes, ...highlightCtes, ...statCtes].join(',\n');
  return `BEGIN;\nWITH ${allCtes}\n${finalInsert}\nCOMMIT;\n`;
}

// ─── EMIT ───────────────────────────────────────────────────────────────────
const out = [];
out.push('-- Auto-generated by seed-collegeplayers.js');
out.push(`-- Count: ${COUNT} collegeplayers`);
out.push(`-- PI signal mix: ~20% portal_keywords, ~10% bio_and_film, ~70% stable`);
out.push(`-- browsing_coaches signal NOT emitted (no coach_profile_views inserted)`);
out.push(`-- Generated: ${new Date().toISOString()}`);
out.push('-- Cleanup: DELETE FROM users WHERE email LIKE \'randtest.%@test.com\';');
out.push('');
for (let i = 0; i < COUNT; i++) {
  out.push(emitUser(i));
}
process.stdout.write(out.join('\n'));
console.error(`[seed-collegeplayers] emitted ${COUNT} users`);
