// ============================================================
// RECRUIT ASSISTANT — GLOSSARY & REFERENCE
// ============================================================
// This file defines the term glossary, database column mappings,
// and stat definitions used by the LLM to interpret coach requests
// and translate them into structured player search filters.
//
// EDIT THIS FILE to adjust how the LLM interprets coach language.
// ============================================================

const RA_GLOSSARY = {

    // ========================================================
    // 1. DATABASE COLUMN REFERENCE — player_profiles table
    // ========================================================
    // These are the actual database columns the LLM can filter on.
    //
    // Column              | Type           | Notes
    // --------------------|----------------|----------------------------------
    // first_name          | VARCHAR(100)   | Player's first name
    // last_name           | VARCHAR(100)   | Player's last name
    // position            | VARCHAR        | Stored as slash-separated (e.g. "QB", "WR/CB")
    // height              | INTEGER        | Stored in INCHES (e.g. 73 = 6'1)
    // weight              | INTEGER        | Stored in POUNDS
    // gpa                 | DECIMAL(3,2)   | 0.00 – 4.00
    // sat_score           | INTEGER        | SAT score
    // act_score           | INTEGER        | ACT score
    // graduation_year     | INTEGER        | e.g. 2026, 2027
    // team_name           | VARCHAR(255)   | High school or college team name
    // city                | VARCHAR(100)   | Player's city
    // state               | VARCHAR(50)    | Player's state (e.g. "Texas", "FL")
    // player_status       | ENUM           | freshman, sophomore, junior, senior
    // college_division    | VARCHAR(50)    | FBS, FCS, D2, D3, NAIA, NJCAA (college/transfer players)
    // conference          | VARCHAR(100)   | Conference name (college/transfer players)
    // number              | INTEGER        | Jersey number
    // eligibility         | VARCHAR(50)    | Years of eligibility remaining (transfer players)
    // transfer            | VARCHAR(1)     | 'y' or 'n' — is the player a transfer
    // offers              | TEXT           | Pipe-delimited offer strings (e.g. "Ohio State|FBS|Alabama|FBS")
    // hudl_profile        | TEXT           | Hudl profile link
    // bio                 | TEXT           | Player bio text
    // cc_views            | INTEGER        | Number of college coach profile views
    // profile_visibility  | VARCHAR(20)    | 'everyone' or 'private'

    // ========================================================
    // 2. POSITIONS — Full list of selectable positions
    // ========================================================
    positions: {
        // Offense — Skill
        'QB':  { full: 'Quarterback',       side: 'offense', group: 'skill' },
        'RB':  { full: 'Running Back',      side: 'offense', group: 'skill' },
        'FB':  { full: 'Fullback',          side: 'offense', group: 'skill' },
        'WR':  { full: 'Wide Receiver',     side: 'offense', group: 'skill' },
        'TE':  { full: 'Tight End',         side: 'offense', group: 'skill' },

        // Offense — Line
        'OT':  { full: 'Offensive Tackle',  side: 'offense', group: 'line' },
        'OG':  { full: 'Offensive Guard',   side: 'offense', group: 'line' },
        'C':   { full: 'Center',            side: 'offense', group: 'line' },

        // Defense — Line
        'DE':  { full: 'Defensive End',     side: 'defense', group: 'line' },
        'DT':  { full: 'Defensive Tackle',  side: 'defense', group: 'line' },
        'NT':  { full: 'Nose Tackle',       side: 'defense', group: 'line' },

        // Defense — Linebackers
        'ILB': { full: 'Inside Linebacker', side: 'defense', group: 'linebacker' },
        'OLB': { full: 'Outside Linebacker',side: 'defense', group: 'linebacker' },

        // Defense — Secondary
        'CB':  { full: 'Cornerback',        side: 'defense', group: 'secondary' },
        'S':   { full: 'Safety',            side: 'defense', group: 'secondary' },

        // Special Teams
        'K':   { full: 'Kicker',            side: 'special', group: 'special' },
        'P':   { full: 'Punter',            side: 'special', group: 'special' },
        'LS':  { full: 'Long Snapper',      side: 'special', group: 'special' }
    },

    // ========================================================
    // 3. POSITION GROUP ALIASES
    // ========================================================
    // When a coach says a group name, expand to these positions.
    positionGroups: {
        'offensive line':    ['OT', 'OG', 'C'],
        'o-line':            ['OT', 'OG', 'C'],
        'oline':             ['OT', 'OG', 'C'],
        'ol':                ['OT', 'OG', 'C'],
        'linemen':           ['OT', 'OG', 'C', 'DE', 'DT', 'NT'],
        'offensive linemen': ['OT', 'OG', 'C'],

        'defensive line':    ['DE', 'DT', 'NT'],
        'd-line':            ['DE', 'DT', 'NT'],
        'dline':             ['DE', 'DT', 'NT'],
        'dl':                ['DE', 'DT', 'NT'],
        'defensive linemen': ['DE', 'DT', 'NT'],

        'linebackers':       ['ILB', 'OLB'],
        'lbs':               ['ILB', 'OLB'],
        'backers':           ['ILB', 'OLB'],

        'defensive backs':   ['CB', 'S'],
        'dbs':               ['CB', 'S'],
        'secondary':         ['CB', 'S'],

        'skill positions':   ['QB', 'RB', 'WR', 'TE'],
        'skill guys':        ['QB', 'RB', 'WR', 'TE'],
        'skill players':     ['QB', 'RB', 'WR', 'TE'],
        'receivers':         ['WR', 'TE'],
        'pass catchers':     ['WR', 'TE'],

        'special teams':     ['K', 'P', 'LS'],
        'specialists':       ['K', 'P', 'LS'],
        'kickers':           ['K'],
        'punters':           ['P'],

        'rushers':           ['DE', 'OLB'],
        'edge':              ['DE', 'OLB'],
        'edge rushers':      ['DE', 'OLB'],
        'pass rushers':      ['DE', 'OLB'],

        'backs':             ['RB', 'FB'],
        'running backs':     ['RB', 'FB'],

        'big guys':          ['OT', 'OG', 'C', 'DE', 'DT', 'NT'],
        'big men':           ['OT', 'OG', 'C', 'DE', 'DT', 'NT']
    },

    // ========================================================
    // 4. STATS BY POSITION — stored in JSONB `stats` column
    // ========================================================
    // Table: player_game_stats
    // Column: stats (JSONB) — keys below are the actual JSON keys
    // Column: position (VARCHAR) — the position this stat line is for
    // Linked via: game_id → player_games (game_date, season_year, opponent, result)
    //
    // season_year special values:
    //   0  = career / all-time totals
    //  -1  = last season (transfer players)
    //  2024, 2025, etc. = specific season

    statsByPosition: {
        QB: {
            rush_yds:  { label: 'Rush Yards',      unit: 'yards' },
            rush_tds:  { label: 'Rush Touchdowns',  unit: 'count' },
            pass_yds:  { label: 'Pass Yards',       unit: 'yards' },
            pass_tds:  { label: 'Pass Touchdowns',  unit: 'count' },
            ints:      { label: 'Interceptions Thrown', unit: 'count' },
            'comp_%':  { label: 'Completion Percentage', unit: 'percent' }
        },
        RB: {
            rush_yds:  { label: 'Rush Yards',      unit: 'yards' },
            rush_tds:  { label: 'Rush Touchdowns',  unit: 'count' },
            rec:       { label: 'Receptions',       unit: 'count' },
            rec_yds:   { label: 'Receiving Yards',  unit: 'yards' },
            rec_tds:   { label: 'Receiving Touchdowns', unit: 'count' }
        },
        FB: {
            rush_yds:  { label: 'Rush Yards',      unit: 'yards' },
            rush_tds:  { label: 'Rush Touchdowns',  unit: 'count' },
            rec:       { label: 'Receptions',       unit: 'count' },
            rec_yds:   { label: 'Receiving Yards',  unit: 'yards' },
            rec_tds:   { label: 'Receiving Touchdowns', unit: 'count' }
        },
        WR: {
            rec:       { label: 'Receptions',       unit: 'count' },
            rec_yds:   { label: 'Receiving Yards',  unit: 'yards' },
            rec_tds:   { label: 'Receiving Touchdowns', unit: 'count' }
        },
        TE: {
            rec:       { label: 'Receptions',       unit: 'count' },
            rec_yds:   { label: 'Receiving Yards',  unit: 'yards' },
            rec_tds:   { label: 'Receiving Touchdowns', unit: 'count' }
        },
        // OT, OG, C — no individual stats tracked
        OT: {},
        OG: {},
        C:  {},
        DE: {
            tackles:   { label: 'Tackles',          unit: 'count' },
            tfls:      { label: 'Tackles for Loss', unit: 'count' },
            sacks:     { label: 'Sacks',            unit: 'count' },
            pbu:       { label: 'Pass Breakups',    unit: 'count' },
            ff:        { label: 'Forced Fumbles',   unit: 'count' }
        },
        DT: {
            tackles:   { label: 'Tackles',          unit: 'count' },
            tfls:      { label: 'Tackles for Loss', unit: 'count' },
            sacks:     { label: 'Sacks',            unit: 'count' },
            pbu:       { label: 'Pass Breakups',    unit: 'count' },
            ff:        { label: 'Forced Fumbles',   unit: 'count' }
        },
        NT: {
            tackles:   { label: 'Tackles',          unit: 'count' },
            tfls:      { label: 'Tackles for Loss', unit: 'count' },
            sacks:     { label: 'Sacks',            unit: 'count' },
            pbu:       { label: 'Pass Breakups',    unit: 'count' },
            ff:        { label: 'Forced Fumbles',   unit: 'count' }
        },
        ILB: {
            tackles:   { label: 'Tackles',          unit: 'count' },
            tfls:      { label: 'Tackles for Loss', unit: 'count' },
            sacks:     { label: 'Sacks',            unit: 'count' },
            ff:        { label: 'Forced Fumbles',   unit: 'count' },
            int:       { label: 'Interceptions',    unit: 'count' },
            pbu:       { label: 'Pass Breakups',    unit: 'count' }
        },
        OLB: {
            tackles:   { label: 'Tackles',          unit: 'count' },
            tfls:      { label: 'Tackles for Loss', unit: 'count' },
            sacks:     { label: 'Sacks',            unit: 'count' },
            ff:        { label: 'Forced Fumbles',   unit: 'count' },
            int:       { label: 'Interceptions',    unit: 'count' },
            pbu:       { label: 'Pass Breakups',    unit: 'count' }
        },
        CB: {
            tackles:   { label: 'Tackles',          unit: 'count' },
            int:       { label: 'Interceptions',    unit: 'count' },
            pbu:       { label: 'Pass Breakups',    unit: 'count' }
        },
        S: {
            tackles:   { label: 'Tackles',          unit: 'count' },
            int:       { label: 'Interceptions',    unit: 'count' },
            pbu:       { label: 'Pass Breakups',    unit: 'count' }
        },
        K: {
            att:       { label: 'Field Goal Attempts', unit: 'count' },
            m:         { label: 'Field Goals Made',    unit: 'count' },
            blk:       { label: 'Blocked Kicks',       unit: 'count' },
            long:      { label: 'Longest FG',          unit: 'yards' },
            pats:      { label: 'PATs Made',            unit: 'count' }
        },
        P: {
            att:       { label: 'Punts',               unit: 'count' },
            long:      { label: 'Longest Punt',        unit: 'yards' },
            avg:       { label: 'Average Distance',    unit: 'yards' },
            tb:        { label: 'Touchbacks',          unit: 'count' },
            fc:        { label: 'Fair Catches Forced', unit: 'count' },
            i20:       { label: 'Inside 20',           unit: 'count' },
            '50+':     { label: 'Punts 50+ Yards',    unit: 'count' },
            blk:       { label: 'Blocked Punts',       unit: 'count' }
        },
        LS: {}
    },

    // ========================================================
    // 5. STAT TERM ALIASES
    // ========================================================
    // Maps natural language stat references → actual JSON keys.
    // The LLM should match coach language to these, then use the
    // key to query the JSONB stats column.

    statAliases: {
        // Passing
        'passing yards':        'pass_yds',
        'pass yards':           'pass_yds',
        'yards passing':        'pass_yds',
        'threw for':            'pass_yds',
        'passing touchdowns':   'pass_tds',
        'pass tds':             'pass_tds',
        'passing tds':          'pass_tds',
        'touchdown passes':     'pass_tds',
        'td passes':            'pass_tds',
        'completion percentage':'comp_%',
        'completion rate':      'comp_%',
        'comp percentage':      'comp_%',
        'comp %':               'comp_%',
        'accuracy':             'comp_%',

        // Rushing
        'rushing yards':        'rush_yds',
        'rush yards':           'rush_yds',
        'yards rushing':        'rush_yds',
        'ran for':              'rush_yds',
        'rushing touchdowns':   'rush_tds',
        'rush tds':             'rush_tds',
        'rushing tds':          'rush_tds',

        // Receiving
        'receptions':           'rec',
        'catches':              'rec',
        'caught':               'rec',
        'receiving yards':      'rec_yds',
        'rec yards':            'rec_yds',
        'yards receiving':      'rec_yds',
        'receiving touchdowns': 'rec_tds',
        'rec tds':              'rec_tds',
        'receiving tds':        'rec_tds',

        // Interceptions (thrown by QB)
        'interceptions thrown': 'ints',
        'picks thrown':         'ints',
        'ints thrown':          'ints',

        // Defense
        'tackles':              'tackles',
        'total tackles':        'tackles',
        'tkls':                 'tackles',
        'tackles for loss':     'tfls',
        'tfls':                 'tfls',
        'tfl':                  'tfls',
        'sacks':                'sacks',
        'qb sacks':             'sacks',
        'pass breakups':        'pbu',
        'pbus':                 'pbu',
        'passes defended':      'pbu',
        'pass deflections':     'pbu',
        'forced fumbles':       'ff',
        'fumbles forced':       'ff',

        // Interceptions (by defender)
        'interceptions':        'int',
        'picks':                'int',
        'ints':                 'int',

        // Kicking
        'field goals':          'm',
        'field goals made':     'm',
        'fgs made':             'm',
        'fg attempts':          'att',
        'field goal attempts':  'att',
        'longest field goal':   'long',
        'fg long':              'long',
        'extra points':         'pats',
        'pat':                  'pats',
        'pats':                 'pats',
        'blocked kicks':        'blk',

        // Punting
        'punts':                'att',
        'punt average':         'avg',
        'avg punt':             'avg',
        'longest punt':         'long',
        'touchbacks':           'tb',
        'inside 20':            'i20',
        'inside the 20':        'i20',
        'fair catches':         'fc',
        'blocked punts':        'blk'
    },

    // ========================================================
    // 6. SIZE & PHYSICAL DESCRIPTORS
    // ========================================================
    // These are RELATIVE to the coach's baselines for the position.
    // The LLM should compare these to the coach's saved baselines
    // and convert to absolute height/weight filters.
    //
    // How offsets work:
    //   baseline_min = coach's min for that position
    //   baseline_max = coach's max for that position
    //   heightAdj / weightAdj = inches or lbs to add/subtract from baseline
    //
    // Example: If coach's WR baseline is 5'10–6'3, 175–210 lbs:
    //   "big WR"   → min_height = baseline_min + 2" (6'0), min_weight = baseline_max (210)
    //   "huge WR"  → min_height = baseline_min + 3" (6'1), min_weight = baseline_max + 15 (225)
    //   "tall WR"  → min_height = baseline_max + 3" (6'6), no weight filter
    //   "small WR" → max_height = baseline_min (5'10), max_weight = baseline_min (175)

    sizeTerms: {
        'big':        { heightAdj: '+2',  weightAdj: 'max',    desc: 'height >= baseline + 2", weight >= baseline_max' },
        'huge':       { heightAdj: '+3',  weightAdj: 'max+15', desc: 'height >= baseline + 3", weight >= baseline_max + 15 lbs' },
        'massive':    { heightAdj: '+3',  weightAdj: 'max+15', desc: 'same as huge' },
        'tall':       { heightAdj: '+3',  weightAdj: null,     desc: 'height >= baseline + 3", no weight adjustment' },
        'long':       { heightAdj: '+3',  weightAdj: null,     desc: 'same as tall' },
        'short':      { heightAdj: 'min', weightAdj: null,     desc: 'height <= baseline_min (still within reasonable range)' },
        'undersized': { heightAdj: 'min', weightAdj: 'min',    desc: 'height <= baseline_min, weight <= baseline_min' },
        'thick':      { heightAdj: null,  weightAdj: 'max',    desc: 'weight >= baseline_max, height at baseline' },
        'stocky':     { heightAdj: null,  weightAdj: 'max',    desc: 'same as thick' },
        'heavy':      { heightAdj: null,  weightAdj: 'max',    desc: 'weight >= baseline_max' },
        'lean':       { heightAdj: null,  weightAdj: 'min+10', desc: 'weight <= baseline_min + 10 lbs, height at baseline' },
        'light':      { heightAdj: null,  weightAdj: 'min',    desc: 'weight <= baseline_min' },
        'thin':       { heightAdj: null,  weightAdj: 'min',    desc: 'weight <= baseline_min' },
        'small':      { heightAdj: 'min', weightAdj: 'min',    desc: 'height <= baseline_min, weight <= baseline_min' },
        'physical':   { heightAdj: null,  weightAdj: 'mid+',   desc: 'weight above midpoint of baseline range' },
        'athletic':   { heightAdj: 'mid+', weightAdj: 'mid+',  desc: 'above baseline midpoint in both height AND weight' }
    },

    // ========================================================
    // 6b. SPEED / ATHLETICISM MODIFIERS
    // ========================================================

    speedTerms: {
        'fast':      { weightAdj: 'lighter', desc: 'prioritize lighter end of weight range (skill positions)' },
        'quick':     { heightAdj: 'shorter', weightAdj: 'lighter', desc: 'lighter weight, shorter height (slot/nickel type)' },
        'explosive': { heightAdj: 'mid+', weightAdj: 'mid+', desc: 'above baseline in height AND weight (context note for future stat integration)' },
        'speedy':    { weightAdj: 'lighter', desc: 'same as fast — lighter end of range' },
        'burner':    { weightAdj: 'lighter', desc: 'same as fast — lighter end of range' }
    },

    // ========================================================
    // 6c. POSITION-SPECIFIC DESCRIPTORS
    // ========================================================
    // These terms only apply when paired with certain positions.
    // The LLM should detect the position context and apply these filters.

    positionSpecificTerms: {
        // QB-specific
        QB: {
            'dual threat':   { heightAdj: null, weightAdj: null, note: 'Context note — no direct filter yet. Implies rushing ability.' },
            'dual-threat':   { heightAdj: null, weightAdj: null, note: 'Same as dual threat.' },
            'pocket passer': { heightAdj: '+2', weightAdj: 'max', note: 'Taller, heavier end of QB range.' },
            'pro style':     { heightAdj: '+2', weightAdj: 'max', note: 'Same as pocket passer.' },
            'strong arm':    { heightAdj: null, weightAdj: null, note: 'Context note — no direct filter yet.' },
            'game manager':  { heightAdj: null, weightAdj: null, note: 'Context note — no direct filter yet.' },
            'scrambler':     { heightAdj: null, weightAdj: 'lighter', note: 'Lighter, more mobile QB.' },
            'mobile':        { heightAdj: null, weightAdj: 'lighter', note: 'Same as scrambler.' }
        },

        // WR-specific
        WR: {
            'slot':          { heightAdj: 'min', weightAdj: 'lighter', note: 'Shorter end of WR range, lighter weight.' },
            'slot receiver': { heightAdj: 'min', weightAdj: 'lighter', note: 'Same as slot.' },
            'outside':       { heightAdj: '+2', weightAdj: 'max', note: 'Taller end of WR range (baseline + 2"+), heavier.' },
            'x receiver':    { heightAdj: '+2', weightAdj: 'max', note: 'Same as outside.' },
            'boundary':      { heightAdj: '+2', weightAdj: 'max', note: 'Same as outside.' },
            'deep threat':   { heightAdj: '+2', weightAdj: 'lighter', note: 'Taller, lighter (speed type).' },
            'possession':    { heightAdj: null, weightAdj: 'max', note: 'Baseline height, heavier weight.' },
            'chain mover':   { heightAdj: null, weightAdj: 'max', note: 'Same as possession.' }
        },

        // RB-specific
        RB: {
            'power back':    { heightAdj: '+1', weightAdj: 'max', note: 'Bigger, heavier RB.' },
            'bruiser':       { heightAdj: '+1', weightAdj: 'max', note: 'Same as power back.' },
            'scat back':     { heightAdj: 'min', weightAdj: 'lighter', note: 'Smaller, quicker RB.' },
            'speed back':    { heightAdj: null, weightAdj: 'lighter', note: 'Lighter, faster RB.' },
            'all-purpose':   { heightAdj: null, weightAdj: null, note: 'Context note — check receiving stats too.' },
            'three-down':    { heightAdj: null, weightAdj: 'mid+', note: 'Mid-to-heavy weight, versatile.' },
            'workhorse':     { heightAdj: null, weightAdj: 'max', note: 'Heavier, durable RB.' }
        },

        // TE-specific
        TE: {
            'receiving te':  { heightAdj: null, weightAdj: 'lighter', note: 'Lighter, receiving-focused TE.' },
            'move te':       { heightAdj: null, weightAdj: 'lighter', note: 'Same as receiving TE.' },
            'blocking te':   { heightAdj: '+1', weightAdj: 'max', note: 'Bigger, heavier inline TE.' },
            'inline':        { heightAdj: '+1', weightAdj: 'max', note: 'Same as blocking TE.' },
            'y tight end':   { heightAdj: '+1', weightAdj: 'max', note: 'Same as inline/blocking.' },
            'h-back':        { heightAdj: 'min', weightAdj: 'mid+', note: 'Shorter, versatile TE/FB hybrid.' },
            'mismatch':      { heightAdj: '+2', weightAdj: 'lighter', note: 'Tall but athletic, receiving threat.' }
        },

        // OL-specific (applies to OT, OG, C)
        OT: {
            'mauler':        { heightAdj: null, weightAdj: 'max', note: 'Heaviest end of OL range.' },
            'road grader':   { heightAdj: null, weightAdj: 'max', note: 'Same as mauler.' },
            'nimble':        { heightAdj: '+1', weightAdj: 'lighter', note: 'Taller, lighter — pass protection type.' },
            'pass protector':{ heightAdj: '+1', weightAdj: null, note: 'Taller OT for pass blocking.' },
            'run blocker':   { heightAdj: null, weightAdj: 'max', note: 'Heavier, power run type.' }
        },
        OG: {
            'mauler':        { heightAdj: null, weightAdj: 'max', note: 'Heaviest end of range.' },
            'road grader':   { heightAdj: null, weightAdj: 'max', note: 'Same as mauler.' },
            'puller':        { heightAdj: null, weightAdj: 'lighter', note: 'Lighter, more athletic guard.' }
        },
        C: {
            'anchor':        { heightAdj: null, weightAdj: 'max', note: 'Heavier center.' },
            'athletic':      { heightAdj: null, weightAdj: 'lighter', note: 'Lighter, can reach second level.' }
        },

        // DE-specific
        DE: {
            'speed rusher':  { heightAdj: '+1', weightAdj: 'lighter', note: 'Taller, lighter pass rusher.' },
            'power rusher':  { heightAdj: null, weightAdj: 'max', note: 'Heavier, bull rush type.' },
            'tweener':       { heightAdj: 'min', weightAdj: 'lighter', note: 'Undersized DE, could play OLB.' },
            'edge setter':   { heightAdj: '+1', weightAdj: 'max', note: 'Bigger DE who sets the edge in run D.' }
        },

        // DT-specific
        DT: {
            'nose tackle':   { heightAdj: 'min', weightAdj: 'max', note: 'Shorter, heaviest DT.' },
            'space eater':   { heightAdj: null, weightAdj: 'max', note: 'Heaviest — plugs gaps.' },
            'penetrator':    { heightAdj: null, weightAdj: 'lighter', note: 'Lighter, quicker DT who gets in backfield.' },
            '3-technique':   { heightAdj: null, weightAdj: 'mid+', note: 'Mid-range, balanced DT.' }
        },

        // LB-specific (applies to ILB, OLB)
        ILB: {
            'thumper':       { heightAdj: null, weightAdj: 'max', note: 'Heavy, run-stopping LB.' },
            'downhill':      { heightAdj: null, weightAdj: 'max', note: 'Same as thumper.' },
            'coverage lb':   { heightAdj: null, weightAdj: 'lighter', note: 'Lighter LB who can cover.' },
            'sideline to sideline': { heightAdj: null, weightAdj: 'lighter', note: 'Lighter, rangy LB.' }
        },
        OLB: {
            'stand-up rusher': { heightAdj: '+1', weightAdj: 'mid+', note: 'OLB who rushes the passer.' },
            'sam':           { heightAdj: null, weightAdj: 'max', note: 'Strong-side LB, heavier.' },
            'will':          { heightAdj: null, weightAdj: 'lighter', note: 'Weak-side LB, lighter and faster.' },
            'hybrid':        { heightAdj: 'mid+', weightAdj: 'mid+', note: 'Versatile DE/OLB type.' }
        },

        // CB-specific
        CB: {
            'shutdown':      { heightAdj: '+2', weightAdj: null, note: 'Taller CB range.' },
            'press corner':  { heightAdj: '+1', weightAdj: 'mid+', note: 'Taller, physical CB.' },
            'nickel':        { heightAdj: 'min', weightAdj: 'lighter', note: 'Shorter, quicker CB for slot coverage.' },
            'zone corner':   { heightAdj: null, weightAdj: null, note: 'Context note — no direct physical filter.' },
            'ball hawk':     { heightAdj: null, weightAdj: null, note: 'Context note — check INT stats.' },
            'lockdown':      { heightAdj: '+1', weightAdj: null, note: 'Taller, coverage CB.' }
        },

        // S-specific
        S: {
            'hard hitter':   { heightAdj: null, weightAdj: 'max', note: 'Heavier safety, physical in run support.' },
            'enforcer':      { heightAdj: null, weightAdj: 'max', note: 'Same as hard hitter.' },
            'free safety':   { heightAdj: null, weightAdj: 'lighter', note: 'Lighter, rangier safety — centerfield type.' },
            'strong safety': { heightAdj: null, weightAdj: 'max', note: 'Heavier, box safety.' },
            'box safety':    { heightAdj: null, weightAdj: 'max', note: 'Same as strong safety.' },
            'centerfield':   { heightAdj: '+1', weightAdj: 'lighter', note: 'Taller, rangier — plays deep.' },
            'hybrid safety': { heightAdj: null, weightAdj: 'mid+', note: 'Versatile — can play in box or deep.' },
            'ball hawk':     { heightAdj: null, weightAdj: null, note: 'Context note — check INT stats.' }
        },

        // K/P-specific
        K: {
            'big leg':       { heightAdj: null, weightAdj: null, note: 'Context note — check long FG stat.' },
            'accurate':      { heightAdj: null, weightAdj: null, note: 'Context note — check FG % (m/att).' }
        },
        P: {
            'boomer':        { heightAdj: null, weightAdj: null, note: 'Context note — check avg and long stats.' },
            'directional':   { heightAdj: null, weightAdj: null, note: 'Context note — check i20 stat.' }
        }
    },

    // ========================================================
    // 6d. GENERAL RECRUITING TERMS
    // ========================================================

    recruitingTerms: {
        'ready now':     { filter: { column: 'graduation_year', value: 'current_class' }, desc: 'graduation_year = current recruiting class' },
        'project':       { filter: { metrics: 'below_baseline_1tier' }, desc: 'Metrics below baseline but within 1 tier down. Still worth developing.' },
        'sleeper':       { filter: { offers: 'count_max_2', metrics: 'meets_baseline' }, desc: 'Lower offer count, but meets baseline metrics.' },
        'hidden gem':    { filter: { offers: 'count_max_2', metrics: 'meets_baseline' }, desc: 'Same as sleeper.' },
        'under the radar': { filter: { offers: 'count_max_1' }, desc: 'Very few or no offers.' },
        'local':         { filter: { column: 'state', value: 'coach_state' }, desc: 'Same state as coach\'s team.' },
        'in-state':      { filter: { column: 'state', value: 'coach_state' }, desc: 'Same as local.' },
        'in state':      { filter: { column: 'state', value: 'coach_state' }, desc: 'Same as local.' },
        'out of state':  { filter: { column: 'state', value: 'not_coach_state' }, desc: 'Exclude coach\'s state.' },
        'out-of-state':  { filter: { column: 'state', value: 'not_coach_state' }, desc: 'Same as out of state.' },
        'nearby':        { filter: { column: 'state', value: 'coach_region' }, desc: 'Same state or neighboring states.' },
        'high ceiling':  { filter: { metrics: 'above_baseline' }, desc: 'Exceeds baseline metrics — upside player.' },
        'high upside':   { filter: { metrics: 'above_baseline' }, desc: 'Same as high ceiling.' },
        'plug and play': { filter: { graduation_year: 'current_class', metrics: 'meets_baseline' }, desc: 'Ready now + meets baseline.' },
        'day one starter': { filter: { graduation_year: 'current_class', metrics: 'above_baseline' }, desc: 'Ready now + above baseline.' }
    },

    // ========================================================
    // 6e. COMPARISON OPERATORS (Natural Language)
    // ========================================================
    // The LLM should parse these patterns from coach input
    // and convert them to structured min/max filters.
    //
    // Pattern                | Parsed As
    // -----------------------|------------------------------------------
    // "at least 6'2"         | min_height = 74 (inches)
    // "over 200 lbs"         | min_weight = 200
    // "under 3.0 GPA"        | max_gpa = 3.0
    // "6'0 to 6'3"           | min_height = 72, max_height = 75
    // "200-230 lbs"          | min_weight = 200, max_weight = 230
    // "taller than 6'1"      | min_height = 74 (6'1 + 1")
    // "heavier than 220"     | min_weight = 221
    // "no shorter than 5'10" | min_height = 70
    // "no lighter than 180"  | min_weight = 180
    // "at most 250 lbs"      | max_weight = 250
    // "above 3.5 GPA"        | min_gpa = 3.5
    // "below 6'0"            | max_height = 71 (6'0 - 1")
    // "3.0+ GPA"             | min_gpa = 3.0
    // "6'2+"                 | min_height = 74
    // "200+"                 | min_weight = 200

    comparisonPatterns: [
        { pattern: 'at least {value}',      operator: '>=' },
        { pattern: 'at most {value}',        operator: '<=' },
        { pattern: 'over {value}',           operator: '>' },
        { pattern: 'under {value}',          operator: '<' },
        { pattern: 'above {value}',          operator: '>' },
        { pattern: 'below {value}',          operator: '<' },
        { pattern: 'taller than {value}',    operator: '>', dimension: 'height' },
        { pattern: 'shorter than {value}',   operator: '<', dimension: 'height' },
        { pattern: 'heavier than {value}',   operator: '>', dimension: 'weight' },
        { pattern: 'lighter than {value}',   operator: '<', dimension: 'weight' },
        { pattern: 'no shorter than {value}',operator: '>=', dimension: 'height' },
        { pattern: 'no lighter than {value}',operator: '>=', dimension: 'weight' },
        { pattern: 'no taller than {value}', operator: '<=', dimension: 'height' },
        { pattern: 'no heavier than {value}',operator: '<=', dimension: 'weight' },
        { pattern: '{value}+',               operator: '>=' },
        { pattern: '{min} to {max}',         operator: 'range' },
        { pattern: '{min}-{max}',            operator: 'range' },
        { pattern: 'between {min} and {max}',operator: 'range' }
    ],

    // ========================================================
    // 7. ACADEMIC DESCRIPTORS
    // ========================================================

    academicTerms: {
        'high gpa':         { column: 'gpa', operator: '>=', value: 3.5 },
        'good grades':      { column: 'gpa', operator: '>=', value: 3.0 },
        'strong academics': { column: 'gpa', operator: '>=', value: 3.2 },
        'honor roll':       { column: 'gpa', operator: '>=', value: 3.5 },
        'academic':         { column: 'gpa', operator: '>=', value: 3.0 },
        'smart':            { column: 'gpa', operator: '>=', value: 3.0 },
        'qualifies':        { column: 'gpa', operator: '>=', value: null }, // uses coach's min GPA baseline
        'qualifier':        { column: 'gpa', operator: '>=', value: null }, // uses coach's min GPA baseline
        'eligible':         { column: 'gpa', operator: '>=', value: null }  // uses coach's min GPA baseline
    },

    // ========================================================
    // 8. CLASS / GRADUATION YEAR ALIASES
    // ========================================================

    classTerms: {
        'freshman':   { column: 'player_status', value: 'freshman' },
        'frosh':      { column: 'player_status', value: 'freshman' },
        'sophomore':  { column: 'player_status', value: 'sophomore' },
        'soph':       { column: 'player_status', value: 'sophomore' },
        'junior':     { column: 'player_status', value: 'junior' },
        'senior':     { column: 'player_status', value: 'senior' },

        // Graduation year references (dynamic — current year based)
        'class of':       { column: 'graduation_year', value: null }, // parse the year from context
        '2025':           { column: 'graduation_year', value: 2025 },
        '2026':           { column: 'graduation_year', value: 2026 },
        '2027':           { column: 'graduation_year', value: 2027 },
        '2028':           { column: 'graduation_year', value: 2028 },
        '2029':           { column: 'graduation_year', value: 2029 }
    },

    // ========================================================
    // 9. LOCATION / STATE ALIASES
    // ========================================================

    stateAliases: {
        'alabama': 'Alabama', 'al': 'Alabama',
        'alaska': 'Alaska', 'ak': 'Alaska',
        'arizona': 'Arizona', 'az': 'Arizona',
        'arkansas': 'Arkansas', 'ar': 'Arkansas',
        'california': 'California', 'ca': 'California', 'cali': 'California',
        'colorado': 'Colorado', 'co': 'Colorado',
        'connecticut': 'Connecticut', 'ct': 'Connecticut',
        'delaware': 'Delaware', 'de_state': 'Delaware',
        'florida': 'Florida', 'fl': 'Florida', 'fla': 'Florida',
        'georgia': 'Georgia', 'ga': 'Georgia',
        'hawaii': 'Hawaii', 'hi': 'Hawaii',
        'idaho': 'Idaho', 'id_state': 'Idaho',
        'illinois': 'Illinois', 'il': 'Illinois',
        'indiana': 'Indiana', 'in_state': 'Indiana',
        'iowa': 'Iowa', 'ia': 'Iowa',
        'kansas': 'Kansas', 'ks': 'Kansas',
        'kentucky': 'Kentucky', 'ky': 'Kentucky',
        'louisiana': 'Louisiana', 'la': 'Louisiana',
        'maine': 'Maine', 'me_state': 'Maine',
        'maryland': 'Maryland', 'md': 'Maryland',
        'massachusetts': 'Massachusetts', 'ma': 'Massachusetts', 'mass': 'Massachusetts',
        'michigan': 'Michigan', 'mi': 'Michigan', 'mich': 'Michigan',
        'minnesota': 'Minnesota', 'mn': 'Minnesota',
        'mississippi': 'Mississippi', 'ms': 'Mississippi', 'miss': 'Mississippi',
        'missouri': 'Missouri', 'mo': 'Missouri',
        'montana': 'Montana', 'mt': 'Montana',
        'nebraska': 'Nebraska', 'ne': 'Nebraska', 'neb': 'Nebraska',
        'nevada': 'Nevada', 'nv': 'Nevada',
        'new hampshire': 'New Hampshire', 'nh': 'New Hampshire',
        'new jersey': 'New Jersey', 'nj': 'New Jersey',
        'new mexico': 'New Mexico', 'nm': 'New Mexico',
        'new york': 'New York', 'ny': 'New York',
        'north carolina': 'North Carolina', 'nc': 'North Carolina',
        'north dakota': 'North Dakota', 'nd': 'North Dakota',
        'ohio': 'Ohio', 'oh': 'Ohio',
        'oklahoma': 'Oklahoma', 'ok': 'Oklahoma',
        'oregon': 'Oregon', 'or_state': 'Oregon',
        'pennsylvania': 'Pennsylvania', 'pa': 'Pennsylvania', 'penn': 'Pennsylvania',
        'rhode island': 'Rhode Island', 'ri': 'Rhode Island',
        'south carolina': 'South Carolina', 'sc': 'South Carolina',
        'south dakota': 'South Dakota', 'sd': 'South Dakota',
        'tennessee': 'Tennessee', 'tn': 'Tennessee', 'tenn': 'Tennessee',
        'texas': 'Texas', 'tx': 'Texas',
        'utah': 'Utah', 'ut': 'Utah',
        'vermont': 'Vermont', 'vt': 'Vermont',
        'virginia': 'Virginia', 'va': 'Virginia',
        'washington': 'Washington', 'wa': 'Washington',
        'west virginia': 'West Virginia', 'wv': 'West Virginia',
        'wisconsin': 'Wisconsin', 'wi': 'Wisconsin', 'wis': 'Wisconsin',
        'wyoming': 'Wyoming', 'wy': 'Wyoming',
        'district of columbia': 'District of Columbia', 'dc': 'District of Columbia'
    },

    // ========================================================
    // 10. DIVISION ALIASES
    // ========================================================

    divisionAliases: {
        'fbs':       'D1 FBS',
        'd1':        'D1 FBS',       // ambiguous — defaults to D1 FBS
        'division 1':'D1 FBS',
        'division i':'D1 FBS',
        'fcs':       'D1 FCS',
        '1-aa':      'D1 FCS',
        'division 1-aa': 'D1 FCS',
        'd2':        'D2',
        'division 2':'D2',
        'division ii':'D2',
        'd3':        'D3',
        'division 3':'D3',
        'division iii':'D3',
        'naia':      'NAIA',
        'njcaa':     'NJCAA',
        'juco':      'NJCAA',
        'junior college': 'NJCAA',
        'community college': 'NJCAA'
    },

    // ========================================================
    // 11. TRANSFER PORTAL TERMS
    // ========================================================

    transferTerms: {
        'transfer':          { column: 'transfer', value: 'y' },
        'transfer portal':   { column: 'transfer', value: 'y' },
        'portal':            { column: 'transfer', value: 'y' },
        'portal player':     { column: 'transfer', value: 'y' },
        'in the portal':     { column: 'transfer', value: 'y' },
        'transferring':      { column: 'transfer', value: 'y' },

        // Eligibility
        '1 year':            { column: 'eligibility', value: '1' },
        '2 years':           { column: 'eligibility', value: '2' },
        '3 years':           { column: 'eligibility', value: '3' },
        '4 years':           { column: 'eligibility', value: '4' },
        'immediate eligibility': { column: 'eligibility', value: '1' },
        'years of eligibility':  { column: 'eligibility', value: null }, // parse number from context
        'years remaining':       { column: 'eligibility', value: null },
        'years left':            { column: 'eligibility', value: null }
    },

    // ========================================================
    // 12. OFFER-RELATED TERMS
    // ========================================================
    // Offers are stored as pipe-delimited text in player_profiles.offers
    // Format: "CollegeName|Division|CollegeName|Division|..."
    // Querying for "has offers" or "number of offers" requires
    // parsing the offers column.

    offerTerms: {
        'has offers':         { type: 'has_any',   value: true },
        'has an offer':       { type: 'has_any',   value: true },
        'no offers':          { type: 'has_any',   value: false },
        'offered':            { type: 'has_any',   value: true },
        'uncommitted':        { type: 'uncommitted' },
        'committed':          { type: 'committed' },
        'multiple offers':    { type: 'count_min', value: 2 },
        'several offers':     { type: 'count_min', value: 3 },
        'highly recruited':   { type: 'count_min', value: 5 },
        'under the radar':    { type: 'count_max', value: 1 },
        'hidden gem':         { type: 'count_max', value: 2 },
        'sleeper':            { type: 'count_max', value: 2 }
    },

    // ========================================================
    // 13. HEIGHT CONVERSION HELPER
    // ========================================================
    // Heights in the database are stored in INCHES.
    // Coach input uses feet'inches format.
    // Use this to convert when building queries.

    heightToInches: function(heightStr) {
        // Accepts: "6'2", "6'2\"", "6-2", "74" (raw inches)
        if (!heightStr) return null;
        const str = String(heightStr).trim();

        // Already inches (just a number)
        if (/^\d+$/.test(str) && parseInt(str) > 12) return parseInt(str);

        // feet'inches or feet-inches
        const match = str.match(/(\d+)['\-](\d+)/);
        if (match) return parseInt(match[1]) * 12 + parseInt(match[2]);

        // Just feet (e.g. "6" probably means 6'0)
        if (/^\d$/.test(str)) return parseInt(str) * 12;

        return null;
    },

    inchesToHeight: function(inches) {
        if (!inches) return '';
        const ft = Math.floor(inches / 12);
        const ins = inches % 12;
        return `${ft}'${ins}`;
    },

    // ========================================================
    // 14. SEARCH ENDPOINTS REFERENCE
    // ========================================================
    // These are the backend API endpoints available for player search.
    //
    // GET /api/profile/discover/hsplayers
    //   Params: position, graduation_year, state, min_height, min_weight, min_gpa, q
    //
    // GET /api/profile/discover/collegeplayers
    //   Params: position, college_division, state, q
    //
    // GET /api/profile/discover/transferplayers
    //   Params: position, eligibility, college_division, min_height, min_weight, min_gpa, q

    searchEndpoints: {
        hsplayers: {
            path: '/profile/discover/hsplayers',
            filters: ['position', 'graduation_year', 'state', 'min_height', 'min_weight', 'min_gpa', 'q']
        },
        collegeplayers: {
            path: '/profile/discover/collegeplayers',
            filters: ['position', 'college_division', 'state', 'q']
        },
        transferplayers: {
            path: '/profile/discover/transferplayers',
            filters: ['position', 'eligibility', 'college_division', 'min_height', 'min_weight', 'min_gpa', 'q']
        }
    }
};

// Export for use by recruit-assistant.js (and eventually the LLM integration)
if (typeof window !== 'undefined') {
    window.RA_GLOSSARY = RA_GLOSSARY;
}
