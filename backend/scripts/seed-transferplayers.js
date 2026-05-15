#!/usr/bin/env node
/**
 * seed-transferplayers.js
 *
 * Generates SQL for N randomized transferplayer test profiles per testing.md.
 * Outputs to stdout; redirect to a .sql file then pipe to psql.
 *
 * Usage:
 *   node backend/scripts/seed-transferplayers.js --count=200 > bulk-transferplayers.sql
 *
 * Key differences from hsplayer (testing.md transferplayer section):
 *   * transfer = 'y' (lowercase single char)
 *   * college_division = previous school's division (D1 FBS/FCS/D2/D3 only)
 *   * team_name = previous school name (must match school-logos.json exactly)
 *   * city/state = previous school's location, not hometown
 *   * eligibility (YOE) REQUIRED (1-4)
 *   * Exactly 2 player_games rows: season_year=0 (career) + season_year=-1 (last season)
 *   * Career-scale + single-season-scale jsonb stats per position
 *   * Offers populated (5-10), excluding previous school
 *   * Subscription active (paid role), same 'player' tier as hsplayer
 *   * No PI keyword tuning needed (transferplayers excluded from PI by design)
 *   * No portal_watchlist inserts (coach-action only)
 *
 * Cleanup (any environment): DELETE FROM users WHERE email LIKE 'randtest.%@test.com';
 */

const fs = require('fs');
const path = require('path');

// ─── ARGS ───────────────────────────────────────────────────────────────────
const args = process.argv.slice(2).reduce((acc, a) => {
  const m = a.match(/^--([^=]+)=(.+)$/);
  if (m) acc[m[1]] = m[2];
  return acc;
}, {});
const COUNT = parseInt(args.count || '200', 10);
if (!Number.isFinite(COUNT) || COUNT < 1) {
  console.error('Usage: node seed-transferplayers.js --count=N (N>=1)');
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

// Position-realistic height/weight ranges (testing.md — slightly tighter for college bodies)
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

// Conference pools by division (used as a free-text label)
const CONFERENCES = {
  'D1 FBS': ['SEC','Big Ten','ACC','Big 12','Pac-12','AAC','Mountain West','C-USA','MAC','Sun Belt'],
  'D1 FCS': ['CAA','Big Sky','MVFC','Patriot League','Southern','Southland','Ivy League','MEAC','SWAC','OVC'],
  'D2':     ['GLIAC','PSAC','GLVC','SAC','GAC','NSIC','CIAA','GNAC','MIAA','Lone Star'],
  'D3':     ['OAC','WIAC','MIAC','NWC','SCIAC','CCIW','NJAC','ODAC','NESCAC','Liberty League']
};

// Natural transfer bios (NO PI keyword tuning needed — transferplayers are excluded from PI)
const BIOS = [
  'Grad transfer with immediate eligibility. Ready for a fresh start.',
  'In the portal. Looking for a new home to compete for a championship.',
  'Transferring to find the right fit. Years of eligibility left to make an impact.',
  'Entering the portal with a clear head and fresh legs.',
  'New chapter. Ready to prove myself at the next stop.',
  'Open to the right program. Coachable, competitive, ready to compete day one.',
  'Hungry for an opportunity. Built different through the grind.'
];

const PERMISSIONS = ['everyone','followers','nobody'];
const PLAYER_STATUS = ['sophomore','junior','senior']; // transferplayers are mid-college, skip freshman

// ─── LOAD SCHOOL LOGOS + CITIES ─────────────────────────────────────────────
const LOGOS_PATH = path.join(__dirname, '..', '..', 'frontend', 'assets', 'school-logos.json');
const schoolLogos = JSON.parse(fs.readFileSync(LOGOS_PATH, 'utf-8'));
const ELIGIBLE_SCHOOLS = Object.entries(schoolLogos)
  .filter(([_, m]) => m.logo && ['D1 FBS','D1 FCS','D2','D3'].includes(m.division))
  .map(([name, m]) => ({ name, division: m.division }));
if (ELIGIBLE_SCHOOLS.length === 0) {
  console.error('FATAL: no eligible schools loaded from', LOGOS_PATH);
  process.exit(1);
}

// School name -> approximate city/state. The school-logos.json doesn't have location,
// so we use heuristic mapping based on common patterns. For test data this is fine —
// the city/state are display labels next to the school logo and just need to be plausible.
// Fall back to a generic college-town distribution for schools we can't pattern-match.
const COLLEGE_CITY_STATE = [
  ['Tuscaloosa','Alabama'],['Auburn','Alabama'],['Athens','Georgia'],['Tallahassee','Florida'],
  ['Gainesville','Florida'],['Knoxville','Tennessee'],['Lexington','Kentucky'],['Columbia','South Carolina'],
  ['Fayetteville','Arkansas'],['College Station','Texas'],['Austin','Texas'],['Lubbock','Texas'],
  ['Norman','Oklahoma'],['Stillwater','Oklahoma'],['Manhattan','Kansas'],['Lincoln','Nebraska'],
  ['Ames','Iowa'],['Iowa City','Iowa'],['Madison','Wisconsin'],['Ann Arbor','Michigan'],
  ['East Lansing','Michigan'],['Columbus','Ohio'],['Bloomington','Indiana'],['West Lafayette','Indiana'],
  ['Evanston','Illinois'],['Champaign','Illinois'],['Minneapolis','Minnesota'],['State College','Pennsylvania'],
  ['Pittsburgh','Pennsylvania'],['Newark','New Jersey'],['Piscataway','New Jersey'],['College Park','Maryland'],
  ['Chestnut Hill','Massachusetts'],['Syracuse','New York'],['Ithaca','New York'],['Hanover','New Hampshire'],
  ['Providence','Rhode Island'],['New Haven','Connecticut'],['Princeton','New Jersey'],['Philadelphia','Pennsylvania'],
  ['Charlottesville','Virginia'],['Blacksburg','Virginia'],['Durham','North Carolina'],['Chapel Hill','North Carolina'],
  ['Raleigh','North Carolina'],['Winston-Salem','North Carolina'],['Clemson','South Carolina'],
  ['Atlanta','Georgia'],['Miami','Florida'],['Coral Gables','Florida'],['Boca Raton','Florida'],
  ['Tampa','Florida'],['Orlando','Florida'],['Boulder','Colorado'],['Fort Collins','Colorado'],
  ['Logan','Utah'],['Provo','Utah'],['Salt Lake City','Utah'],['Boise','Idaho'],['Moscow','Idaho'],
  ['Pullman','Washington'],['Seattle','Washington'],['Eugene','Oregon'],['Corvallis','Oregon'],
  ['Stanford','California'],['Berkeley','California'],['Los Angeles','California'],['Pasadena','California'],
  ['Tempe','Arizona'],['Tucson','Arizona'],['Las Vegas','Nevada'],['Reno','Nevada'],
  ['Honolulu','Hawaii'],['Annapolis','Maryland'],['West Point','New York'],['Colorado Springs','Colorado']
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
const sqOrNull = (s) => (s === null || s === undefined) ? 'NULL' : sq(s);

// ─── OFFERS — 5 to 10 per transferplayer, excl previous school ──────────────
function pickOffers(prevSchoolName) {
  const count = randInt(5, 10);
  const pool = ELIGIBLE_SCHOOLS.filter(s => s.name !== prevSchoolName);
  const used = new Set();
  const picks = [];
  let attempts = 0;
  while (picks.length < count && attempts < count * 5) {
    const s = pick(pool);
    if (!used.has(s.name)) { used.add(s.name); picks.push(s); }
    attempts++;
  }
  return picks.map(s => `${s.name}, ${s.division}`).join('|');
}

// ─── CAREER + LAST-SEASON STATS BY POSITION (testing.md) ────────────────────
// Returns {
//   career: jsonbExpr|null,
//   lastSeason: jsonbExpr|null,
//   summaryCareer:    [int, int, int]|null,  // matches positionStatsMap in transfer-portal.js
//   summaryLastSeason:[int, int, int]|null,  // (frontend col labels: index 0/1/2)
// }
// OT/OG/C/LS get null for all (still emit game rows for OT/OG/C but skip stats).
//
// Frontend Current Portal labels per position (frontend/collegecoach/tabs/transfer-portal.js:90):
//   QB:        [Total Yards, Total TDs, INT]
//   RB/FB:     [Total Yards, Rec, Total TDs]
//   WR/TE:     [Rec, Rec Yards, Total TDs]
//   DE/DT/NT:  [Tackles, TFLs, Sacks]
//   ILB/OLB:   [Tackles, TFLs, Sacks]
//   CB/S:      [Tackles, PBUs, INTs]
//   K:         [Made, Att, Long]
//   P:         [Att, Avg, I20]
function aggregateStats(position) {
  const half = (n) => Math.round(n / 2);
  switch (position) {
    case 'QB': {
      const passYds = randInt(5000, 8000), passTds = randInt(35, 60),
            ints = randInt(12, 22), compPct = randFloat(58.0, 68.0, 1),
            rushYds = randInt(400, 900), rushTds = randInt(6, 14);
      return {
        career: `jsonb_build_object('pass_yds', ${passYds}, 'pass_tds', ${passTds}, 'rush_yds', ${rushYds}, 'rush_tds', ${rushTds}, 'ints', ${ints}, 'comp_%', ${compPct})`,
        lastSeason: `jsonb_build_object('pass_yds', ${half(passYds)}, 'pass_tds', ${half(passTds)}, 'rush_yds', ${half(rushYds)}, 'rush_tds', ${half(rushTds)}, 'ints', ${half(ints)}, 'comp_%', ${compPct})`,
        // [Total Yards, Total TDs, INT]
        summaryCareer:    [passYds + rushYds, passTds + rushTds, ints],
        summaryLastSeason:[half(passYds) + half(rushYds), half(passTds) + half(rushTds), half(ints)]
      };
    }
    case 'RB':
    case 'FB': {
      const rushYds = randInt(2000, 3500), rushTds = randInt(18, 32),
            rec = randInt(40, 80), recYds = randInt(300, 700), recTds = randInt(2, 6);
      return {
        career: `jsonb_build_object('rush_yds', ${rushYds}, 'rush_tds', ${rushTds}, 'rec', ${rec}, 'rec_yds', ${recYds}, 'rec_tds', ${recTds})`,
        lastSeason: `jsonb_build_object('rush_yds', ${half(rushYds)}, 'rush_tds', ${half(rushTds)}, 'rec', ${half(rec)}, 'rec_yds', ${half(recYds)}, 'rec_tds', ${half(recTds)})`,
        // [Total Yards, Rec, Total TDs]
        summaryCareer:    [rushYds + recYds, rec, rushTds + recTds],
        summaryLastSeason:[half(rushYds) + half(recYds), half(rec), half(rushTds) + half(recTds)]
      };
    }
    case 'WR': {
      const rec = randInt(110, 180), recYds = randInt(1800, 2800), recTds = randInt(14, 25);
      return {
        career: `jsonb_build_object('rec', ${rec}, 'rec_yds', ${recYds}, 'rec_tds', ${recTds})`,
        lastSeason: `jsonb_build_object('rec', ${half(rec)}, 'rec_yds', ${half(recYds)}, 'rec_tds', ${half(recTds)})`,
        // [Rec, Rec Yards, Total TDs]
        summaryCareer:    [rec, recYds, recTds],
        summaryLastSeason:[half(rec), half(recYds), half(recTds)]
      };
    }
    case 'TE': {
      const rec = randInt(70, 120), recYds = randInt(900, 1500), recTds = randInt(8, 15);
      return {
        career: `jsonb_build_object('rec', ${rec}, 'rec_yds', ${recYds}, 'rec_tds', ${recTds})`,
        lastSeason: `jsonb_build_object('rec', ${half(rec)}, 'rec_yds', ${half(recYds)}, 'rec_tds', ${half(recTds)})`,
        // [Rec, Rec Yards, Total TDs]
        summaryCareer:    [rec, recYds, recTds],
        summaryLastSeason:[half(rec), half(recYds), half(recTds)]
      };
    }
    case 'DE':
    case 'DT':
    case 'NT': {
      const tackles = randInt(90, 130), tfls = randInt(22, 36), sacks = randInt(10, 20),
            pbu = randInt(4, 10), ff = randInt(2, 6);
      return {
        career: `jsonb_build_object('tackles', ${tackles}, 'tfls', ${tfls}, 'sacks', ${sacks}, 'pbu', ${pbu}, 'ff', ${ff})`,
        lastSeason: `jsonb_build_object('tackles', ${half(tackles)}, 'tfls', ${half(tfls)}, 'sacks', ${half(sacks)}, 'pbu', ${half(pbu)}, 'ff', ${half(ff)})`,
        // [Tackles, TFLs, Sacks]
        summaryCareer:    [tackles, tfls, sacks],
        summaryLastSeason:[half(tackles), half(tfls), half(sacks)]
      };
    }
    case 'ILB':
    case 'OLB': {
      const tackles = randInt(150, 230), tfls = randInt(18, 30), sacks = randInt(5, 12),
            ff = randInt(3, 6), int_ = randInt(2, 5), pbu = randInt(8, 15);
      return {
        career: `jsonb_build_object('tackles', ${tackles}, 'tfls', ${tfls}, 'sacks', ${sacks}, 'ff', ${ff}, 'int', ${int_}, 'pbu', ${pbu})`,
        lastSeason: `jsonb_build_object('tackles', ${half(tackles)}, 'tfls', ${half(tfls)}, 'sacks', ${half(sacks)}, 'ff', ${half(ff)}, 'int', ${half(int_)}, 'pbu', ${half(pbu)})`,
        // [Tackles, TFLs, Sacks]
        summaryCareer:    [tackles, tfls, sacks],
        summaryLastSeason:[half(tackles), half(tfls), half(sacks)]
      };
    }
    case 'CB':
    case 'S': {
      const tackles = randInt(80, 120), int_ = randInt(6, 12), pbu = randInt(15, 25);
      return {
        career: `jsonb_build_object('tackles', ${tackles}, 'int', ${int_}, 'pbu', ${pbu})`,
        lastSeason: `jsonb_build_object('tackles', ${half(tackles)}, 'int', ${half(int_)}, 'pbu', ${half(pbu)})`,
        // [Tackles, PBUs, INTs]
        summaryCareer:    [tackles, pbu, int_],
        summaryLastSeason:[half(tackles), half(pbu), half(int_)]
      };
    }
    case 'K': {
      const att = randInt(35, 50), m = randInt(28, Math.min(att, 44)),
            long = randInt(48, 55), pats = randInt(60, 80), blk = randInt(0, 2);
      return {
        career: `jsonb_build_object('att', ${att}, 'm', ${m}, 'long', ${long}, 'pats', ${pats}, 'blk', ${blk})`,
        lastSeason: `jsonb_build_object('att', ${half(att)}, 'm', ${half(m)}, 'long', ${long-2}, 'pats', ${half(pats)}, 'blk', ${Math.min(blk, 1)})`,
        // [Made, Att, Long]
        summaryCareer:    [m, att, long],
        summaryLastSeason:[half(m), half(att), long-2]
      };
    }
    case 'P': {
      const att = randInt(80, 140), long = randInt(55, 72), avg = randFloat(38.0, 46.0, 1),
            tb = randInt(6, 14), fc = randInt(15, 30), i20 = randInt(20, 40),
            fiftyPlus = randInt(10, 25), blk = randInt(0, 2);
      return {
        career: `jsonb_build_object('att', ${att}, 'long', ${long}, 'avg', ${avg}, 'tb', ${tb}, 'fc', ${fc}, 'i20', ${i20}, '50+', ${fiftyPlus}, 'blk', ${blk})`,
        lastSeason: `jsonb_build_object('att', ${half(att)}, 'long', ${long-2}, 'avg', ${avg}, 'tb', ${half(tb)}, 'fc', ${half(fc)}, 'i20', ${half(i20)}, '50+', ${half(fiftyPlus)}, 'blk', ${Math.min(blk, 1)})`,
        // [Att, Avg, I20] — schema is integer so Avg gets rounded (Math.round preserves the value)
        summaryCareer:    [att, Math.round(avg), i20],
        summaryLastSeason:[half(att), Math.round(avg), half(i20)]
      };
    }
    default:
      // OT/OG/C/LS — no stats rows; still emit games per testing.md
      return { career: null, lastSeason: null, summaryCareer: null, summaryLastSeason: null };
  }
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

  // Previous school (with logo, D1-D3 only)
  const prevSchool = pick(ELIGIBLE_SCHOOLS);
  const teamName = prevSchool.name;
  const collegeDiv = prevSchool.division;

  // City/state — use a college-town pool. The data is plausible but doesn't strictly
  // match the picked school's actual location. For test data this is fine.
  const [city, state] = pick(COLLEGE_CITY_STATE);

  // Conference matches previous school's division
  const conference = pick(CONFERENCES[collegeDiv] || ['Independent']);

  const eligibility = randInt(1, 4);
  const gradYear = randInt(2026, 2028);
  // DOB: 19-22 years ago (testing.md collegeplayer range; same for transfer)
  const dobAge = randInt(19, 22);
  const dob = new Date();
  dob.setFullYear(dob.getFullYear() - dobAge);
  dob.setMonth(randInt(0, 11));
  dob.setDate(randInt(1, 28));
  const dobStr = dob.toISOString().slice(0, 10);

  // GPA — college admissions floor (2.50-4.00 per testing.md)
  const gpa = randFloat(2.50, 4.00, 2);
  // No SAT/ACT for college transfers
  const satScore = 'NULL';
  const actScore = 'NULL';

  // PFF grade — realistic spread. Most cluster 60-85, ~10% above 85, ~15% below 60.
  // ~8% NULL (no grade on file) to exercise the "exclude ungraded players" filter.
  const pffRoll = randInt(0, 99);
  let pffGrade;
  if (pffRoll < 8)        pffGrade = 'NULL';
  else if (pffRoll < 23)  pffGrade = randFloat(45.0, 60.0, 1); // below-average tier
  else if (pffRoll < 60)  pffGrade = randFloat(60.0, 75.0, 1); // average to above-average
  else if (pffRoll < 90)  pffGrade = randFloat(75.0, 85.0, 1); // high tier
  else                    pffGrade = randFloat(85.0, 95.0, 1); // elite tier

  // Star rating NULL for transferplayers (they were recruited out of HS years ago)
  const starRating = 'NULL';

  // Higher visibility than HS players
  const ccViews = randInt(0, 1499);
  const followers = randInt(0, 799);
  const following = randInt(0, 399);

  const bio = pick(BIOS);
  const status = pick(PLAYER_STATUS);
  const number = randInt(0, 98);
  const phone = `555-${String(randInt(0,999)).padStart(3,'0')}-${String(randInt(0,9999)).padStart(4,'0')}`;
  const msgPerm = pick(PERMISSIONS);
  const visPerm = pick(PERMISSIONS);
  const stripeCus = 'cus_randtest_' + Math.random().toString(36).slice(2, 16).padEnd(14, '0');
  const stripeSub = 'sub_randtest_' + Math.random().toString(36).slice(2, 16).padEnd(14, '0');

  const offers = pickOffers(teamName);
  const stats = aggregateStats(position);
  const insertsStats = stats.career !== null;

  // Summary stat fields — derived from position-specific aggregate jsonb so the
  // Current Portal row preview (collegecoach/tabs/transfer-portal.js:181) renders
  // real numbers instead of 0s. OT/OG/C/LS get 0 (no inline stat line rendered).
  const [sumLast1, sumLast2, sumLast3] = stats.summaryLastSeason || [0, 0, 0];
  const [sumCar1, sumCar2, sumCar3]    = stats.summaryCareer    || [0, 0, 0];

  // CTE chain
  const userCte = `new_user AS (
  INSERT INTO users (id, email, role, email_verified, profile_completed, is_active, cognito_sub, username, subscription_status, subscription_tier, stripe_customer_id, stripe_subscription_id)
  VALUES (uuid_generate_v4(), ${sq(email)}, 'player', true, true, true, 'randtest-' || gen_random_uuid()::text, ${sq(username)}, 'active', 'player', ${sq(stripeCus)}, ${sq(stripeSub)})
  RETURNING id
)`;

  const profileCte = `new_profile AS (
  INSERT INTO player_profiles (user_id, first_name, last_name, date_of_birth, team_name, graduation_year, city, state, height, weight, gpa, sat_score, act_score, bio, phone, hudl_profile, twitter_handle, instagram_handle, player_status, username, cc_views, college_division, transfer, eligibility, number, conference, offers, star_rating, followers_count, following_count, message_permissions, profile_visibility, position, lastseasonstat1, lastseasonstat2, lastseasonstat3, careerstat1, careerstat2, careerstat3, pff_grade)
  SELECT nu.id, ${sq(first)}, ${sq(last)}, DATE ${sq(dobStr)}, ${sq(teamName)}, ${gradYear}, ${sq(city)}, ${sq(state)}, ${height}, ${weight}, ${gpa}, ${satScore}, ${actScore}, ${sq(bio)}, ${sq(phone)}, ${sq(`https://hudl.com/profile/${username}`)}, ${sq('@'+username)}, ${sq('@'+username)}, ${sq(status)}, ${sq(username)}, ${ccViews}, ${sq(collegeDiv)}, 'y', ${eligibility}, ${number}, ${sq(conference)}, ${sqOrNull(offers)}, ${starRating}, ${followers}, ${following}, ${sq(msgPerm)}, ${sq(visPerm)}, ${sq(position)}, ${sumLast1}, ${sumLast2}, ${sumLast3}, ${sumCar1}, ${sumCar2}, ${sumCar3}, ${pffGrade}
  FROM new_user nu RETURNING id, user_id
)`;

  // 2 player_games rows — season_year 0 (career) and -1 (last season), opponent + result NULL
  const gCareerCte = `g_career AS (INSERT INTO player_games (player_id, game_date, season_year, opponent, result) SELECT id, CURRENT_DATE, 0, NULL, NULL FROM new_profile RETURNING id, player_id)`;
  const gLastCte   = `g_last AS (INSERT INTO player_games (player_id, game_date, season_year, opponent, result) SELECT id, CURRENT_DATE, -1, NULL, NULL FROM new_profile RETURNING id, player_id)`;

  // Highlights — sophomore + junior labels (college, not HS)
  const hl1Cte = `hl1 AS (INSERT INTO player_highlights (user_id, highlight_type, title, hudl_link, video_url) SELECT user_id, 'sophomore', 'Sophomore Season Highlights', ${sq(`https://hudl.com/v/${username}/sophomore`)}, NULL FROM new_profile RETURNING id)`;
  const hl2Cte = `hl2 AS (INSERT INTO player_highlights (user_id, highlight_type, title, hudl_link, video_url) SELECT user_id, 'junior', 'Junior Season Highlights', ${sq(`https://hudl.com/v/${username}/junior`)}, NULL FROM new_profile RETURNING id)`;

  let finalInsert;
  let ctes;
  if (insertsStats) {
    // Career stats CTE; last-season stats as the final non-CTE insert
    const careerStatCte = `stat_career AS (INSERT INTO player_game_stats (game_id, position, stats, player_name, user_id) SELECT g_career.id, ${sq(position)}, ${stats.career}, ${sq(first + ' ' + last)}, np.user_id FROM g_career, new_profile np RETURNING id)`;
    ctes = [userCte, profileCte, gCareerCte, gLastCte, hl1Cte, hl2Cte, careerStatCte].join(',\n');
    finalInsert = `INSERT INTO player_game_stats (game_id, position, stats, player_name, user_id) SELECT g_last.id, ${sq(position)}, ${stats.lastSeason}, ${sq(first + ' ' + last)}, np.user_id FROM g_last, new_profile np;`;
  } else {
    // OT/OG/C: 2 game rows but no stat rows. End the CTE chain with a trivial SELECT.
    ctes = [userCte, profileCte, gCareerCte, gLastCte, hl1Cte, hl2Cte].join(',\n');
    finalInsert = `SELECT 1;`;
  }

  return `BEGIN;\nWITH ${ctes}\n${finalInsert}\nCOMMIT;\n`;
}

// ─── EMIT ───────────────────────────────────────────────────────────────────
const out = [];
out.push('-- Auto-generated by seed-transferplayers.js');
out.push(`-- Count: ${COUNT} transferplayers`);
out.push(`-- Generated: ${new Date().toISOString()}`);
out.push('-- Cleanup: DELETE FROM users WHERE email LIKE \'randtest.%@test.com\';');
out.push('');
for (let i = 0; i < COUNT; i++) {
  out.push(emitUser());
}
process.stdout.write(out.join('\n'));
console.error(`[seed-transferplayers] emitted ${COUNT} users`);
