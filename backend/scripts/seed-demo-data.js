/**
 * Demo Data Seed Script
 *
 * Creates 15 fully-populated QB profiles (5 HS, 5 transfer, 5 college)
 * plus 4 minimal coach accounts for portal intelligence signals.
 *
 * Run AFTER the base seed: npm run seed
 * Usage: node backend/scripts/seed-demo-data.js
 *
 * All accounts use password: Test123!@#
 * Idempotent — safe to re-run.
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const path = require('path');

const pool = new Pool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: false
});

const SALT_ROUNDS = 10;
const TEST_PASSWORD = 'Test123!@#';

// ============================================================
// PLAYER DATA
// ============================================================

const HS_PLAYERS = [
  {
    email: 'demo.cody.harmon@test.com', first_name: 'Cody', last_name: 'Harmon', username: 'codyharmon',
    team_name: 'Valor Christian', city: 'Highlands Ranch', state: 'Colorado', height: 75, weight: 210,
    gpa: 3.9, sat_score: 1380, act_score: 31, graduation_year: 2026, number: '7', player_status: 'junior',
    star_rating: 4, twitter_handle: '@codyharmon7', instagram_handle: 'cody.harmon7',
    hudl_profile: 'https://www.hudl.com/profile/demo/codyharmon',
    bio: 'Pro-style QB at Valor Christian. 2x All-Conference, team captain. 3.9 GPA with a focus on engineering. Looking to compete at the next level and earn a scholarship to play D1 football.',
    lastseasonstat1: '2,850 pass yds', lastseasonstat2: '28 TDs', lastseasonstat3: '6 INTs',
    careerstat1: '6,200 pass yds', careerstat2: '58 TDs', careerstat3: '14 INTs',
    offers: 'University of Colorado Boulder|Colorado State University|University of Nebraska - Lincoln|University of Oregon|Boise State University|University of Wyoming'
  },
  {
    email: 'demo.tyler.rae@test.com', first_name: 'Tyler', last_name: 'Rae', username: 'tylerrae',
    team_name: 'Cherry Creek', city: 'Greenwood Village', state: 'Colorado', height: 73, weight: 195,
    gpa: 3.5, sat_score: 1260, act_score: 28, graduation_year: 2027, number: '12', player_status: 'sophomore',
    star_rating: 3, twitter_handle: '@tylerrae12', instagram_handle: 'tyler.rae12',
    hudl_profile: 'https://www.hudl.com/profile/demo/tylerrae',
    bio: 'Dual-threat QB for Cherry Creek HS. Quick release, strong pocket presence. Team MVP sophomore year. Academic All-State honoree.',
    lastseasonstat1: '2,100 pass yds', lastseasonstat2: '19 TDs', lastseasonstat3: '450 rush yds',
    careerstat1: '2,100 pass yds', careerstat2: '19 TDs', careerstat3: '450 rush yds',
    offers: 'Colorado Mesa University|University of Northern Colorado|Abilene Christian University'
  },
  {
    email: 'demo.jaylen.archer@test.com', first_name: 'Jaylen', last_name: 'Archer', username: 'jaylenarcher',
    team_name: 'IMG Academy', city: 'Bradenton', state: 'Florida', height: 76, weight: 220,
    gpa: 3.3, sat_score: 1200, act_score: 26, graduation_year: 2026, number: '1', player_status: 'junior',
    star_rating: 5, twitter_handle: '@jaylenarcher1', instagram_handle: 'jaylen.archer1',
    hudl_profile: 'https://www.hudl.com/profile/demo/jaylenarcher',
    bio: '5-star pro-style QB at IMG Academy. 6\'4" 220 lbs with elite arm talent. National top 25 recruit. Multiple Power 5 offers. Looking to make an immediate impact at the next level.',
    lastseasonstat1: '3,400 pass yds', lastseasonstat2: '38 TDs', lastseasonstat3: '4 INTs',
    careerstat1: '7,800 pass yds', careerstat2: '82 TDs', careerstat3: '12 INTs',
    offers: 'University of Alabama|Ohio State University|University of Georgia|University of Texas at Austin|University of Southern California|Clemson University|University of Florida|University of Michigan|Penn State University|Louisiana State University'
  },
  {
    email: 'demo.bryce.nolan@test.com', first_name: 'Bryce', last_name: 'Nolan', username: 'brycenolan',
    team_name: 'Katy High School', city: 'Katy', state: 'Texas', height: 74, weight: 205,
    gpa: 3.7, sat_score: 1340, act_score: 30, graduation_year: 2026, number: '10', player_status: 'junior',
    star_rating: 4, twitter_handle: '@brycenolan10', instagram_handle: 'bryce.nolan10',
    hudl_profile: 'https://www.hudl.com/profile/demo/brycenolan',
    bio: 'Starting QB for 6A state semifinalist Katy HS. Strong arm, great football IQ. 3.7 GPA, National Honor Society. Ready to compete at the highest level.',
    lastseasonstat1: '3,100 pass yds', lastseasonstat2: '32 TDs', lastseasonstat3: '7 INTs',
    careerstat1: '5,500 pass yds', careerstat2: '55 TDs', careerstat3: '15 INTs',
    offers: 'Texas Tech University|Baylor University|University of Houston|Sam Houston State University|Texas State University'
  },
  {
    email: 'demo.mason.park@test.com', first_name: 'Mason', last_name: 'Park', username: 'masonpark',
    team_name: 'De La Salle', city: 'Concord', state: 'California', height: 72, weight: 190,
    gpa: 3.6, sat_score: 1300, act_score: 29, graduation_year: 2027, number: '3', player_status: 'sophomore',
    star_rating: 3, twitter_handle: '@masonpark3', instagram_handle: 'mason.park3',
    hudl_profile: 'https://www.hudl.com/profile/demo/masonpark',
    bio: 'Sophomore QB at De La Salle. Quick feet, accurate passer. Led JV team to undefeated season. Working to earn varsity starting role.',
    lastseasonstat1: '1,800 pass yds', lastseasonstat2: '15 TDs', lastseasonstat3: '5 INTs',
    careerstat1: '1,800 pass yds', careerstat2: '15 TDs', careerstat3: '5 INTs',
    offers: 'Sacramento State University|University of San Diego'
  }
];

const TRANSFER_PLAYERS = [
  {
    email: 'demo.darius.cole@test.com', first_name: 'Darius', last_name: 'Cole', username: 'dariuscole',
    team_name: 'Oregon State University', city: 'Corvallis', state: 'Oregon',
    college_division: 'D1 FBS', conference: 'Pac-12', transfer: 'y', eligibility: 3,
    height: 75, weight: 215, gpa: 3.2, sat_score: 1180, act_score: 25,
    graduation_year: 2027, number: '9', player_status: 'sophomore',
    twitter_handle: '@dariuscole9', instagram_handle: 'darius.cole9',
    hudl_profile: 'https://www.hudl.com/profile/demo/dariuscole',
    bio: 'Transfer QB from Oregon State. Started 6 games as a sophomore. Looking for a program where I can be the day-one starter and lead an offense. Strong arm, mobile in the pocket.',
    lastseasonstat1: '1,900 pass yds', lastseasonstat2: '14 TDs', lastseasonstat3: '8 INTs',
    careerstat1: '2,400 pass yds', careerstat2: '18 TDs', careerstat3: '11 INTs',
    offers: 'University of Nevada, Reno|Utah State University|San Jose State University|Colorado State University'
  },
  {
    email: 'demo.elijah.monroe@test.com', first_name: 'Elijah', last_name: 'Monroe', username: 'elijahmonroe',
    team_name: 'Sam Houston State University', city: 'Huntsville', state: 'Texas',
    college_division: 'D1 FBS', conference: 'Conference USA', transfer: 'y', eligibility: 2,
    height: 73, weight: 200, gpa: 3.4, sat_score: 1250, act_score: 27,
    graduation_year: 2026, number: '5', player_status: 'junior',
    twitter_handle: '@elijahmonroe5', instagram_handle: 'elijah.monroe5',
    hudl_profile: 'https://www.hudl.com/profile/demo/elijahmonroe',
    bio: 'Dual-threat QB entering the transfer portal from Sam Houston. 2 years of eligibility remaining. Seeking a competitive program with a strong passing scheme.',
    lastseasonstat1: '2,200 pass yds', lastseasonstat2: '18 TDs', lastseasonstat3: '600 rush yds',
    careerstat1: '4,100 pass yds', careerstat2: '34 TDs', careerstat3: '1,100 rush yds',
    offers: 'University of Texas at El Paso|Middle Tennessee State University|University of Louisiana at Lafayette'
  },
  {
    email: 'demo.keegan.shaw@test.com', first_name: 'Keegan', last_name: 'Shaw', username: 'keeganshaw',
    team_name: 'Colorado Mesa University', city: 'Grand Junction', state: 'Colorado',
    college_division: 'D2', conference: 'Rocky Mountain Athletic', transfer: 'y', eligibility: 3,
    height: 74, weight: 208, gpa: 3.1, sat_score: 1150, act_score: 24,
    graduation_year: 2027, number: '14', player_status: 'sophomore',
    twitter_handle: '@keeganshaw14', instagram_handle: 'keegan.shaw14',
    hudl_profile: 'https://www.hudl.com/profile/demo/keeganshaw',
    bio: 'Transfer QB from Colorado Mesa. D2 All-Conference honorable mention. Looking to step up to a bigger program and prove I can compete at a higher level.',
    lastseasonstat1: '2,600 pass yds', lastseasonstat2: '22 TDs', lastseasonstat3: '9 INTs',
    careerstat1: '2,600 pass yds', careerstat2: '22 TDs', careerstat3: '9 INTs',
    offers: 'Adams State University|Western Colorado University'
  },
  {
    email: 'demo.andre.voss@test.com', first_name: 'Andre', last_name: 'Voss', username: 'andrevoss',
    team_name: 'Bethune-Cookman University', city: 'Daytona Beach', state: 'Florida',
    college_division: 'D1 FCS', conference: 'SWAC', transfer: 'y', eligibility: 2,
    height: 76, weight: 225, gpa: 3.0, sat_score: 1100, act_score: 23,
    graduation_year: 2026, number: '2', player_status: 'junior',
    twitter_handle: '@andrevoss2', instagram_handle: 'andre.voss2',
    hudl_profile: 'https://www.hudl.com/profile/demo/andrevoss',
    bio: 'Big-bodied QB with a cannon arm. 6\'4" 225 lbs, entering the portal from Bethune-Cookman. Started every game for two seasons. Ready for a Power 5 opportunity.',
    lastseasonstat1: '2,900 pass yds', lastseasonstat2: '24 TDs', lastseasonstat3: '10 INTs',
    careerstat1: '5,600 pass yds', careerstat2: '46 TDs', careerstat3: '20 INTs',
    offers: 'Florida Atlantic University|University of South Florida|Florida International University|James Madison University|Coastal Carolina University'
  },
  {
    email: 'demo.julian.west@test.com', first_name: 'Julian', last_name: 'West', username: 'julianwest',
    team_name: 'University of Mount Union', city: 'Alliance', state: 'Ohio',
    college_division: 'D3', conference: 'Ohio Athletic', transfer: 'y', eligibility: 4,
    height: 74, weight: 210, gpa: 3.5, sat_score: 1320, act_score: 29,
    graduation_year: 2028, number: '8', player_status: 'freshman',
    twitter_handle: '@julianwest8', instagram_handle: 'julian.west8',
    hudl_profile: 'https://www.hudl.com/profile/demo/julianwest',
    bio: 'D3 national championship program QB looking to move up. Strong academics, 3.5 GPA. 4 years of eligibility remaining. Seeking a D2 or FCS program.',
    lastseasonstat1: '1,500 pass yds', lastseasonstat2: '12 TDs', lastseasonstat3: '4 INTs',
    careerstat1: '1,500 pass yds', careerstat2: '12 TDs', careerstat3: '4 INTs',
    offers: 'Youngstown State University|University of Dayton|Ashland University'
  }
];

const COLLEGE_PLAYERS = [
  {
    email: 'demo.ryan.keeler@test.com', first_name: 'Ryan', last_name: 'Keeler', username: 'ryankeeler',
    team_name: 'Kansas State University', city: 'Manhattan', state: 'Kansas',
    college_division: 'D1 FBS', conference: 'Big 12',
    height: 75, weight: 212, gpa: 3.3, sat_score: 1280, act_score: 28,
    graduation_year: 2027, number: '11', player_status: 'sophomore',
    twitter_handle: '@ryankeeler11', instagram_handle: 'ryan.keeler11',
    hudl_profile: 'https://www.hudl.com/profile/demo/ryankeeler',
    bio: 'Backup QB at Kansas State. Exploring my options for the next chapter of my career. Strong arm, great leader. Ready to be a starter somewhere and make an impact.',
    lastseasonstat1: '800 pass yds', lastseasonstat2: '6 TDs', lastseasonstat3: '3 INTs',
    careerstat1: '1,200 pass yds', careerstat2: '9 TDs', careerstat3: '5 INTs',
    signals: ['portal_keywords', 'browsing_coaches'],
    coach_views: 3
  },
  {
    email: 'demo.trevon.james@test.com', first_name: 'Trevon', last_name: 'James', username: 'trevonjames',
    team_name: 'Boise State University', city: 'Boise', state: 'Idaho',
    college_division: 'D1 FBS', conference: 'Mountain West',
    height: 74, weight: 205, gpa: 3.1, sat_score: 1220, act_score: 26,
    graduation_year: 2026, number: '4', player_status: 'junior',
    twitter_handle: '@trevonjames4', instagram_handle: 'trevon.james4',
    hudl_profile: 'https://www.hudl.com/profile/demo/trevonjames',
    bio: 'Experienced QB at Boise State. Two-year starter with strong game film. Working hard to improve every day and compete for championships.',
    lastseasonstat1: '2,500 pass yds', lastseasonstat2: '20 TDs', lastseasonstat3: '8 INTs',
    careerstat1: '4,800 pass yds', careerstat2: '38 TDs', careerstat3: '16 INTs',
    signals: ['bio_and_film', 'browsing_coaches'],
    coach_views: 4
  },
  {
    email: 'demo.marcus.bell@test.com', first_name: 'Marcus', last_name: 'Bell', username: 'marcusbell',
    team_name: 'Eastern Washington University', city: 'Cheney', state: 'Washington',
    college_division: 'D1 FCS', conference: 'Big Sky',
    height: 73, weight: 198, gpa: 3.4, sat_score: 1260, act_score: 27,
    graduation_year: 2027, number: '6', player_status: 'sophomore',
    twitter_handle: '@marcusbell6', instagram_handle: 'marcus.bell6',
    hudl_profile: 'https://www.hudl.com/profile/demo/marcusbell',
    bio: 'QB at Eastern Washington. Weighing my options and ready for a new beginning. Great pocket passer with a quick release. Looking for the right fit to finish my career.',
    lastseasonstat1: '2,100 pass yds', lastseasonstat2: '16 TDs', lastseasonstat3: '7 INTs',
    careerstat1: '2,100 pass yds', careerstat2: '16 TDs', careerstat3: '7 INTs',
    signals: ['portal_keywords'],
    coach_views: 0
  },
  {
    email: 'demo.sean.calloway@test.com', first_name: 'Sean', last_name: 'Calloway', username: 'seancalloway',
    team_name: 'Colorado School of Mines', city: 'Golden', state: 'Colorado',
    college_division: 'D2', conference: 'Rocky Mountain Athletic',
    height: 74, weight: 207, gpa: 3.8, sat_score: 1400, act_score: 32,
    graduation_year: 2027, number: '15', player_status: 'sophomore',
    twitter_handle: '@seancalloway15', instagram_handle: 'sean.calloway15',
    hudl_profile: 'https://www.hudl.com/profile/demo/seancalloway',
    bio: 'Engineering major and starting QB at Colorado School of Mines. Strong academics and strong arm. Committed to excellence on and off the field.',
    lastseasonstat1: '2,300 pass yds', lastseasonstat2: '19 TDs', lastseasonstat3: '6 INTs',
    careerstat1: '2,300 pass yds', careerstat2: '19 TDs', careerstat3: '6 INTs',
    signals: ['browsing_coaches', 'bio_and_film'],
    coach_views: 5
  },
  {
    email: 'demo.nate.fischer@test.com', first_name: 'Nate', last_name: 'Fischer', username: 'natefischer',
    team_name: 'University of Wisconsin - Whitewater', city: 'Whitewater', state: 'Wisconsin',
    college_division: 'D3', conference: 'WIAC',
    height: 73, weight: 200, gpa: 3.6, sat_score: 1300, act_score: 29,
    graduation_year: 2027, number: '13', player_status: 'sophomore',
    twitter_handle: '@natefischer13', instagram_handle: 'nate.fischer13',
    hudl_profile: 'https://www.hudl.com/profile/demo/natefischer',
    bio: 'QB at UW-Whitewater, a perennial D3 powerhouse. Looking for new opportunity at the next level. Accurate passer with a high football IQ and strong leadership skills.',
    lastseasonstat1: '2,000 pass yds', lastseasonstat2: '17 TDs', lastseasonstat3: '5 INTs',
    careerstat1: '2,000 pass yds', careerstat2: '17 TDs', careerstat3: '5 INTs',
    signals: ['portal_keywords', 'bio_and_film'],
    coach_views: 0
  }
];

// Extra coach accounts for browsing_coaches signal
const EXTRA_COACHES = [
  { email: 'demo.coach.sec@test.com', first_name: 'Mark', last_name: 'Davis', username: 'democoachsec', team_name: 'University of Alabama', city: 'Tuscaloosa', state: 'Alabama', college_division: 'D1 FBS', conference: 'SEC', position_title: 'Quarterbacks Coach' },
  { email: 'demo.coach.big12@test.com', first_name: 'Jim', last_name: 'Porter', username: 'democoachbig12', team_name: 'University of Oklahoma', city: 'Norman', state: 'Oklahoma', college_division: 'D1 FBS', conference: 'Big 12', position_title: 'Offensive Coordinator' },
  { email: 'demo.coach.pac12@test.com', first_name: 'Steve', last_name: 'Tanaka', username: 'democoachpac12', team_name: 'University of Oregon', city: 'Eugene', state: 'Oregon', college_division: 'D1 FBS', conference: 'Big Ten', position_title: 'Head Coach' },
  { email: 'demo.coach.d2@test.com', first_name: 'Carlos', last_name: 'Mendez', username: 'democoachd2', team_name: 'Colorado State University Pueblo', city: 'Pueblo', state: 'Colorado', college_division: 'D2', conference: 'Rocky Mountain Athletic', position_title: 'Recruiting Coordinator' }
];

// ============================================================
// HELPER FUNCTIONS
// ============================================================

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function generateQBGameStats() {
  const compPct = randomInt(55, 72);
  const attempts = randomInt(22, 40);
  const completions = Math.round(attempts * compPct / 100);
  const passYds = randomInt(150, 380);
  const passTds = randomInt(0, 4);
  const ints = randomInt(0, 2);
  const rushYds = randomInt(-5, 65);
  const rushTds = randomInt(0, 1);
  return {
    pass_yds: passYds,
    pass_tds: passTds,
    rush_yds: rushYds,
    rush_tds: rushTds,
    ints: ints,
    'comp_%': compPct
  };
}

const OPPONENTS_HS = [
  'Eaglecrest', 'Grandview', 'Regis Jesuit', 'Chaparral', 'Legend', 'Fairview',
  'Columbine', 'Mullen', 'Pine Creek', 'Fountain-Fort Carson', 'Central',
  'Westlake', 'Allen', 'Southlake Carroll', 'St. Thomas Aquinas', 'Mater Dei',
  'Bishop Gorman', 'North Shore', 'Lakeland', 'St. Joseph\'s Prep'
];

const OPPONENTS_COLLEGE = [
  'North Dakota State', 'Montana', 'Weber State', 'UC Davis', 'Southern Illinois',
  'Youngstown State', 'Villanova', 'Delaware', 'Richmond', 'New Hampshire',
  'Kennesaw State', 'Chattanooga', 'Mercer', 'Furman', 'Samford',
  'Wyoming', 'Air Force', 'San Jose State', 'UNLV', 'Fresno State',
  'Tulane', 'Memphis', 'UTSA', 'North Texas', 'Western Kentucky'
];

const POST_TEMPLATES = [
  "Great practice today. Putting in the work every day to get better. {emoji}",
  "Blessed to receive an offer from {school}! Thank you to the coaching staff for believing in me. #Recruited",
  "Film study tonight. Breaking down defenses and finding the edge. Iron sharpens iron.",
  "Grateful for my teammates. Can't do this without them. Championship mentality every day.",
  "Offseason grind never stops. 5am workouts, film sessions, and 7-on-7. Trust the process.",
  "Had a great conversation with {coach} today about the program. Excited about the future.",
  "New highlight tape is up! Link in bio. Check it out coaches! #RecruitMe",
  "Game day. Let's go. Time to compete and show what we've been working for all week.",
  "Thankful for the opportunity to play the game I love. Never taking it for granted.",
  "Spring ball starts next week. Time to earn my spot and prove myself on the field."
];

const EMOJIS = ['💪', '🏈', '🔥', '⚡', '🎯', '💯', '🙏'];

function generatePost(player) {
  const template = POST_TEMPLATES[randomInt(0, POST_TEMPLATES.length - 1)];
  return template
    .replace('{emoji}', EMOJIS[randomInt(0, EMOJIS.length - 1)])
    .replace('{school}', player.offers ? player.offers.split('|')[0] : 'a great program')
    .replace('{coach}', 'Coach Johnson');
}

// ============================================================
// SEED FUNCTIONS
// ============================================================

async function createUsers(players, passwordHash) {
  const userIds = {};
  for (const p of players) {
    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [p.email]);
    if (existing.rows.length > 0) {
      userIds[p.email] = existing.rows[0].id;
      console.log(`  EXISTS: ${p.email}`);
      continue;
    }
    const result = await pool.query(
      `INSERT INTO users (email, password_hash, role, email_verified, profile_completed, is_active, cognito_sub)
       VALUES ($1, $2, 'player', true, true, true, $3)
       RETURNING id`,
      [p.email, passwordHash, `local-demo-${p.username}`]
    );
    userIds[p.email] = result.rows[0].id;
    console.log(`  CREATED: ${p.email} (${p.first_name} ${p.last_name})`);
  }
  return userIds;
}

async function createCoachUsers(coaches, passwordHash) {
  const coachIds = {};
  for (const c of coaches) {
    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [c.email]);
    if (existing.rows.length > 0) {
      coachIds[c.email] = existing.rows[0].id;
      console.log(`  EXISTS: ${c.email}`);
      continue;
    }
    const result = await pool.query(
      `INSERT INTO users (email, password_hash, role, email_verified, profile_completed, is_active, cognito_sub)
       VALUES ($1, $2, 'coach', true, true, true, $3)
       RETURNING id`,
      [c.email, passwordHash, `local-demo-${c.username}`]
    );
    coachIds[c.email] = result.rows[0].id;
    console.log(`  CREATED: ${c.email} (${c.first_name} ${c.last_name})`);
  }
  return coachIds;
}

async function createPlayerProfiles(players, userIds) {
  for (const p of players) {
    const userId = userIds[p.email];
    const existing = await pool.query('SELECT id FROM player_profiles WHERE user_id = $1', [userId]);
    if (existing.rows.length > 0) {
      console.log(`  EXISTS: ${p.first_name} ${p.last_name} profile`);
      continue;
    }
    await pool.query(
      `INSERT INTO player_profiles (
        user_id, first_name, last_name, username, position, height, weight,
        gpa, sat_score, act_score, team_name, city, state, graduation_year,
        bio, number, player_status, star_rating, offers,
        college_division, conference, transfer, eligibility,
        twitter_handle, instagram_handle, hudl_profile,
        lastseasonstat1, lastseasonstat2, lastseasonstat3,
        careerstat1, careerstat2, careerstat3
      ) VALUES (
        $1, $2, $3, $4, 'QB', $5, $6,
        $7, $8, $9, $10, $11, $12, $13,
        $14, $15, $16, $17, $18,
        $19, $20, $21, $22,
        $23, $24, $25,
        $26, $27, $28,
        $29, $30, $31
      )`,
      [
        userId, p.first_name, p.last_name, p.username, p.height, p.weight,
        p.gpa, p.sat_score || null, p.act_score || null, p.team_name, p.city, p.state, p.graduation_year,
        p.bio, p.number, p.player_status || null, p.star_rating || null, p.offers || null,
        p.college_division || null, p.conference || null, p.transfer || null, p.eligibility || null,
        p.twitter_handle || null, p.instagram_handle || null, p.hudl_profile || null,
        p.lastseasonstat1 || null, p.lastseasonstat2 || null, p.lastseasonstat3 || null,
        p.careerstat1 || null, p.careerstat2 || null, p.careerstat3 || null
      ]
    );
    console.log(`  CREATED: ${p.first_name} ${p.last_name} profile`);
  }
}

async function createCoachProfiles(coaches, coachIds) {
  for (const c of coaches) {
    const userId = coachIds[c.email];
    const existing = await pool.query('SELECT id FROM coach_profiles WHERE user_id = $1', [userId]);
    if (existing.rows.length > 0) {
      console.log(`  EXISTS: ${c.first_name} ${c.last_name} coach profile`);
      continue;
    }
    await pool.query(
      `INSERT INTO coach_profiles (user_id, first_name, last_name, username, team_name, city, state, college_division, conference, position_title, bio)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [userId, c.first_name, c.last_name, c.username, c.team_name, c.city, c.state, c.college_division, c.conference, c.position_title, `Coach at ${c.team_name}.`]
    );
    console.log(`  CREATED: ${c.first_name} ${c.last_name} coach profile`);
  }
}

async function seedGameStats(allPlayers, userIds) {
  for (const p of allPlayers) {
    const userId = userIds[p.email];

    // Get player_profiles.id
    const profileResult = await pool.query('SELECT id FROM player_profiles WHERE user_id = $1', [userId]);
    if (profileResult.rows.length === 0) continue;
    const profileId = profileResult.rows[0].id;

    // Check if games already exist
    const existing = await pool.query('SELECT COUNT(*) as count FROM player_games WHERE player_id = $1', [profileId]);
    if (parseInt(existing.rows[0].count) >= 8) {
      console.log(`  EXISTS: ${p.first_name} ${p.last_name} game stats`);
      continue;
    }

    const isCollege = !!p.college_division;
    const opponents = isCollege ? OPPONENTS_COLLEGE : OPPONENTS_HS;
    const seasonYear = p.graduation_year <= 2026 ? 2025 : 2024;

    for (let i = 0; i < 8; i++) {
      const opponent = opponents[randomInt(0, opponents.length - 1)];
      const wins = ['W 35-21', 'W 28-14', 'W 42-17', 'W 21-7', 'W 31-24', 'W 38-10'];
      const losses = ['L 14-21', 'L 17-24', 'L 10-28'];
      const result = randomInt(0, 10) < 7 ? wins[randomInt(0, wins.length - 1)] : losses[randomInt(0, losses.length - 1)];
      const gameDate = `${seasonYear}-${String(9 + Math.floor(i / 4)).padStart(2, '0')}-${String(randomInt(1, 28)).padStart(2, '0')}`;

      const gameResult = await pool.query(
        `INSERT INTO player_games (player_id, game_date, season_year, opponent, result)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [profileId, gameDate, seasonYear, opponent, result]
      );

      const stats = generateQBGameStats();
      await pool.query(
        `INSERT INTO player_game_stats (game_id, position, stats, player_name, user_id)
         VALUES ($1, 'QB', $2, $3, $4)`,
        [gameResult.rows[0].id, JSON.stringify(stats), `${p.first_name} ${p.last_name}`, userId]
      );
    }
    console.log(`  CREATED: ${p.first_name} ${p.last_name} — 8 games with stats`);
  }
}

async function seedHighlights(allPlayers, userIds, collegePlayerEmails) {
  for (const p of allPlayers) {
    const userId = userIds[p.email];
    const existing = await pool.query('SELECT COUNT(*) as count FROM player_highlights WHERE user_id = $1', [userId]);
    if (parseInt(existing.rows[0].count) > 0) {
      console.log(`  EXISTS: ${p.first_name} ${p.last_name} highlights`);
      continue;
    }

    const isCollege = collegePlayerEmails.has(p.email);
    const needsRecentHighlight = isCollege && p.signals && (p.signals.includes('bio_and_film'));
    const seasonYear = p.graduation_year <= 2026 ? 2025 : 2024;

    // Season highlight
    const createdAt = needsRecentHighlight
      ? `NOW() - INTERVAL '${randomInt(1, 10)} days'`
      : `'${seasonYear}-12-15'::timestamp`;

    await pool.query(
      `INSERT INTO player_highlights (user_id, highlight_type, title, video_url, hudl_link, created_at)
       VALUES ($1, 'season', $2, $3, $4, ${createdAt})`,
      [userId, `${seasonYear} Season Highlights`, `highlights/${userId}/demo-season-${seasonYear}.mp4`, p.hudl_profile]
    );

    // Game highlight
    await pool.query(
      `INSERT INTO player_highlights (user_id, highlight_type, title, video_url, created_at)
       VALUES ($1, 'game', $2, $3, ${needsRecentHighlight ? `NOW() - INTERVAL '${randomInt(1, 7)} days'` : `'${seasonYear}-11-01'::timestamp`})`,
      [userId, `Week 8 vs ${OPPONENTS_HS[randomInt(0, OPPONENTS_HS.length - 1)]}`, `highlights/${userId}/demo-game-week8.mp4`]
    );

    // Extra highlight for some players
    if (randomInt(0, 1) === 1) {
      await pool.query(
        `INSERT INTO player_highlights (user_id, highlight_type, title, video_url, created_at)
         VALUES ($1, 'game', $2, $3, '${seasonYear}-10-15'::timestamp)`,
        [userId, `Playoff Highlights`, `highlights/${userId}/demo-playoff.mp4`]
      );
    }

    console.log(`  CREATED: ${p.first_name} ${p.last_name} highlights${needsRecentHighlight ? ' (recent — portal signal)' : ''}`);
  }
}

async function seedPosts(allPlayers, userIds) {
  for (const p of allPlayers) {
    const userId = userIds[p.email];
    const existing = await pool.query('SELECT COUNT(*) as count FROM posts WHERE user_id = $1', [userId]);
    if (parseInt(existing.rows[0].count) >= 2) {
      console.log(`  EXISTS: ${p.first_name} ${p.last_name} posts`);
      continue;
    }

    const numPosts = randomInt(2, 3);
    for (let i = 0; i < numPosts; i++) {
      const content = generatePost(p);
      const daysAgo = randomInt(1, 30);
      await pool.query(
        `INSERT INTO posts (user_id, content, created_at) VALUES ($1, $2, NOW() - INTERVAL '${daysAgo} days')`,
        [userId, content]
      );
    }
    console.log(`  CREATED: ${p.first_name} ${p.last_name} — ${numPosts} posts`);
  }
}

async function seedFollows(allPlayers, userIds) {
  // Get existing seeded user IDs
  const existingUsers = await pool.query(
    "SELECT id, email FROM users WHERE email IN ('hsplayer@test.com', 'collegeplayer@test.com', 'transferplayer@test.com', 'collegecoach@test.com', 'hscoach@test.com')"
  );
  const existingIds = existingUsers.rows.reduce((acc, r) => { acc[r.email] = r.id; return acc; }, {});

  const allUserIds = Object.values(userIds);
  let created = 0;

  for (const p of allPlayers) {
    const userId = userIds[p.email];

    // Follow 3-5 random other demo players
    const others = allUserIds.filter(id => id !== userId);
    const numFollows = Math.min(randomInt(3, 5), others.length);
    const shuffled = others.sort(() => Math.random() - 0.5).slice(0, numFollows);

    for (const targetId of shuffled) {
      try {
        await pool.query(
          'INSERT INTO follows (follower_id, following_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [userId, targetId]
        );
        created++;
      } catch (e) { /* duplicate or self-follow */ }
    }

    // Follow existing seeded coach
    if (existingIds['collegecoach@test.com']) {
      try {
        await pool.query(
          'INSERT INTO follows (follower_id, following_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [userId, existingIds['collegecoach@test.com']]
        );
      } catch (e) { /* ignore */ }
    }
  }

  // Have the college coach follow all demo players
  if (existingIds['collegecoach@test.com']) {
    for (const id of allUserIds) {
      try {
        await pool.query(
          'INSERT INTO follows (follower_id, following_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [existingIds['collegecoach@test.com'], id]
        );
      } catch (e) { /* ignore */ }
    }
  }

  console.log(`  CREATED: ${created} follow relationships`);
}

async function seedSubscriptions(players, userIds) {
  // 2026-07: players are FREE on the platform — a subscription only unlocks the
  // AI Rep page, so demo players no longer need one. Leaving them 'active' gave
  // every demo bot free AI Rep AND wrote stripe_subscription_id with a NULL
  // subscription_source, a shape the profile-switch ladder mishandles.
  // Explicitly clear rather than skip, so re-running fixes previously-seeded rows.
  for (const p of players) {
    const userId = userIds[p.email];
    if (!userId) continue;
    await pool.query(
      `UPDATE users SET subscription_status = 'none', subscription_tier = NULL,
       stripe_subscription_id = NULL, subscription_source = NULL
       WHERE id = $1`,
      [userId]
    );
  }
  console.log(`  UPDATED: ${players.length} demo players set to free (no subscription)`);
}

async function seedPortalSignals(collegePlayers, userIds, coachIds) {
  const coachUserIds = Object.values(coachIds);

  for (const p of collegePlayers) {
    const userId = userIds[p.email];
    if (!p.signals) continue;

    // bio_and_film: update player_profiles.updated_at to recent
    if (p.signals.includes('bio_and_film')) {
      const daysAgo = randomInt(1, 10);
      await pool.query(
        `UPDATE player_profiles SET updated_at = NOW() - INTERVAL '${daysAgo} days' WHERE user_id = $1`,
        [userId]
      );
      console.log(`  SIGNAL: ${p.first_name} ${p.last_name} — bio_and_film (updated_at set to ${daysAgo} days ago)`);
    }

    // browsing_coaches: create coach_profile_views for external coaches
    if (p.signals.includes('browsing_coaches') && p.coach_views > 0) {
      let viewsCreated = 0;
      for (let i = 0; i < Math.min(p.coach_views, coachUserIds.length); i++) {
        const coachUserId = coachUserIds[i];
        const daysAgo = randomInt(1, 12);
        // Create 1-3 views per coach to show frequency
        const numViews = randomInt(1, 3);
        for (let v = 0; v < numViews; v++) {
          await pool.query(
            `INSERT INTO coach_profile_views (viewed_coach_id, viewer_id, created_at)
             VALUES ($1, $2, NOW() - INTERVAL '${daysAgo - v} days')`,
            [coachUserId, userId]
          );
          viewsCreated++;
        }
      }
      console.log(`  SIGNAL: ${p.first_name} ${p.last_name} — browsing_coaches (${viewsCreated} views of ${Math.min(p.coach_views, coachUserIds.length)} external coaches)`);
    }
  }
}

async function updateFollowerCounts() {
  // Sync followers_count and following_count for all player_profiles
  await pool.query(`
    UPDATE player_profiles pp SET
      followers_count = (SELECT COUNT(*) FROM follows WHERE following_id = pp.user_id),
      following_count = (SELECT COUNT(*) FROM follows WHERE follower_id = pp.user_id)
  `);
  // Sync for coach_profiles too
  await pool.query(`
    UPDATE coach_profiles cp SET
      followers_count = (SELECT COUNT(*) FROM follows WHERE following_id = cp.user_id),
      following_count = (SELECT COUNT(*) FROM follows WHERE follower_id = cp.user_id)
  `);
  console.log('  UPDATED: follower/following counts synced');
}

// ============================================================
// MAIN
// ============================================================

async function main() {
  console.log('===========================================');
  console.log('  Direct Recruit — Demo Data Seed');
  console.log('===========================================\n');

  try {
    await pool.query('SELECT 1');
    console.log('  Database connection: OK\n');

    const passwordHash = await bcrypt.hash(TEST_PASSWORD, SALT_ROUNDS);
    const allPlayers = [...HS_PLAYERS, ...TRANSFER_PLAYERS, ...COLLEGE_PLAYERS];

    // 1. Create user accounts
    console.log('--- Creating player accounts ---\n');
    const userIds = await createUsers(allPlayers, passwordHash);

    console.log('\n--- Creating extra coach accounts (for portal signals) ---\n');
    const coachIds = await createCoachUsers(EXTRA_COACHES, passwordHash);

    // 2. Create profiles
    console.log('\n--- Creating player profiles ---\n');
    await createPlayerProfiles(allPlayers, userIds);

    console.log('\n--- Creating coach profiles ---\n');
    await createCoachProfiles(EXTRA_COACHES, coachIds);

    // 3. Game stats
    console.log('\n--- Seeding game stats (8 games per player) ---\n');
    await seedGameStats(allPlayers, userIds);

    // 4. Highlights
    console.log('\n--- Seeding highlights ---\n');
    const collegePlayerEmails = new Set(COLLEGE_PLAYERS.map(p => p.email));
    await seedHighlights(allPlayers, userIds, collegePlayerEmails);

    // 5. Posts
    console.log('\n--- Seeding posts ---\n');
    await seedPosts(allPlayers, userIds);

    // 6. Follows
    console.log('\n--- Seeding follow relationships ---\n');
    await seedFollows(allPlayers, userIds);

    // 7. Subscriptions — players are paid again (7-day trial). Demo HS + transfer
    // players are seeded as paid so they pass the paywall in demos.
    console.log('\n--- Seeding player subscriptions ---\n');
    const paidPlayers = [...HS_PLAYERS, ...TRANSFER_PLAYERS];
    await seedSubscriptions(paidPlayers, userIds);

    // 8. Portal signals for college players
    console.log('\n--- Setting up portal intelligence signals ---\n');
    await seedPortalSignals(COLLEGE_PLAYERS, userIds, coachIds);

    // 9. Sync follower counts
    console.log('\n--- Syncing follower counts ---\n');
    await updateFollowerCounts();

    console.log('\n===========================================');
    console.log('  Demo data seeded successfully!');
    console.log('===========================================');
    console.log(`\n  ${allPlayers.length} player accounts created`);
    console.log(`  ${EXTRA_COACHES.length} coach accounts created`);
    console.log(`  Password for all accounts: ${TEST_PASSWORD}`);
    console.log(`  Email format: demo.firstname.lastname@test.com`);
    console.log('\n  Start the server: node backend/server.js');
    console.log('  Sign in as collegecoach@test.com to test AI features\n');

  } catch (err) {
    console.error('\nFATAL:', err.message);
    console.error(err.stack);
  } finally {
    await pool.end();
  }
}

main();
