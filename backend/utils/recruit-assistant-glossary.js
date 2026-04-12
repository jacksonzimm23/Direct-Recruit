// ============================================================
// RECRUIT ASSISTANT — GLOSSARY & REFERENCE (Backend Copy)
// ============================================================
// This is the backend version of the glossary used by the AI utility.
// The frontend version lives at: frontend/collegecoach/tabs/recruit-assistant-glossary.js
// Keep both in sync when making changes.
// ============================================================

const RA_GLOSSARY = {

    // ========================================================
    // 1. DATABASE COLUMN REFERENCE — player_profiles table
    // ========================================================
    databaseColumns: {
        first_name:       { type: 'VARCHAR(100)', note: 'Player first name' },
        last_name:        { type: 'VARCHAR(100)', note: 'Player last name' },
        position:         { type: 'VARCHAR(100)', note: 'Slash-separated (e.g. "QB", "WR/CB")' },
        height:           { type: 'VARCHAR(20)',  note: 'Stored as string like 6\'2" — convert to inches for comparison' },
        weight:           { type: 'INTEGER',      note: 'In pounds' },
        gpa:              { type: 'DECIMAL(3,2)', note: '0.00–4.00' },
        sat_score:        { type: 'INTEGER',      note: 'SAT score' },
        act_score:        { type: 'INTEGER',      note: 'ACT score' },
        graduation_year:  { type: 'INTEGER',      note: 'e.g. 2026, 2027' },
        team_name:        { type: 'VARCHAR(255)', note: 'High school or college team' },
        city:             { type: 'VARCHAR(100)', note: 'Player city' },
        state:            { type: 'VARCHAR(50)',  note: 'Full state name (e.g. "Texas")' },
        player_status:    { type: 'ENUM',         note: 'freshman, sophomore, junior, senior' },
        college_division: { type: 'VARCHAR(50)',  note: 'D1 FBS, D1 FCS, D2, D3, NAIA, NJCAA, 3C2A' },
        conference:       { type: 'VARCHAR(100)', note: 'Conference name' },
        number:           { type: 'VARCHAR',      note: 'Jersey number' },
        eligibility:      { type: 'INTEGER',      note: 'Years remaining (transfer players)' },
        transfer:         { type: 'VARCHAR(1)',   note: "'y' or 'n'" },
        offers:           { type: 'TEXT',         note: 'Pipe-delimited: "Ohio State|FBS|Alabama|FBS"' },
        bio:              { type: 'TEXT',         note: 'Player bio' },
        cc_views:         { type: 'INTEGER',      note: 'College coach profile view count' },
        profile_visibility: { type: 'VARCHAR(20)', note: "'everyone' or 'private'" }
    },

    // ========================================================
    // 2. POSITIONS
    // ========================================================
    positions: {
        'QB':  { full: 'Quarterback',       side: 'offense', group: 'skill' },
        'RB':  { full: 'Running Back',      side: 'offense', group: 'skill' },
        'FB':  { full: 'Fullback',          side: 'offense', group: 'skill' },
        'WR':  { full: 'Wide Receiver',     side: 'offense', group: 'skill' },
        'TE':  { full: 'Tight End',         side: 'offense', group: 'skill' },
        'OT':  { full: 'Offensive Tackle',  side: 'offense', group: 'line' },
        'OG':  { full: 'Offensive Guard',   side: 'offense', group: 'line' },
        'C':   { full: 'Center',            side: 'offense', group: 'line' },
        'DE':  { full: 'Defensive End',     side: 'defense', group: 'line' },
        'DT':  { full: 'Defensive Tackle',  side: 'defense', group: 'line' },
        'NT':  { full: 'Nose Tackle',       side: 'defense', group: 'line' },
        'ILB': { full: 'Inside Linebacker', side: 'defense', group: 'linebacker' },
        'OLB': { full: 'Outside Linebacker',side: 'defense', group: 'linebacker' },
        'CB':  { full: 'Cornerback',        side: 'defense', group: 'secondary' },
        'S':   { full: 'Safety',            side: 'defense', group: 'secondary' },
        'K':   { full: 'Kicker',            side: 'special', group: 'special' },
        'P':   { full: 'Punter',            side: 'special', group: 'special' },
        'LS':  { full: 'Long Snapper',      side: 'special', group: 'special' }
    },

    // ========================================================
    // 3. POSITION GROUP ALIASES
    // ========================================================
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
    // 4. STATS BY POSITION — JSONB keys in player_game_stats.stats
    // ========================================================
    statsByPosition: {
        QB:  { rush_yds: 'Rush Yards', rush_tds: 'Rush TDs', pass_yds: 'Pass Yards', pass_tds: 'Pass TDs', ints: 'INTs Thrown', 'comp_%': 'Completion %' },
        RB:  { rush_yds: 'Rush Yards', rush_tds: 'Rush TDs', rec: 'Receptions', rec_yds: 'Rec Yards', rec_tds: 'Rec TDs' },
        FB:  { rush_yds: 'Rush Yards', rush_tds: 'Rush TDs', rec: 'Receptions', rec_yds: 'Rec Yards', rec_tds: 'Rec TDs' },
        WR:  { rec: 'Receptions', rec_yds: 'Rec Yards', rec_tds: 'Rec TDs' },
        TE:  { rec: 'Receptions', rec_yds: 'Rec Yards', rec_tds: 'Rec TDs' },
        OT: {}, OG: {}, C: {},
        DE:  { tackles: 'Tackles', tfls: 'TFLs', sacks: 'Sacks', pbu: 'Pass Breakups', ff: 'Forced Fumbles' },
        DT:  { tackles: 'Tackles', tfls: 'TFLs', sacks: 'Sacks', pbu: 'Pass Breakups', ff: 'Forced Fumbles' },
        NT:  { tackles: 'Tackles', tfls: 'TFLs', sacks: 'Sacks', pbu: 'Pass Breakups', ff: 'Forced Fumbles' },
        ILB: { tackles: 'Tackles', tfls: 'TFLs', sacks: 'Sacks', ff: 'Forced Fumbles', int: 'INTs', pbu: 'Pass Breakups' },
        OLB: { tackles: 'Tackles', tfls: 'TFLs', sacks: 'Sacks', ff: 'Forced Fumbles', int: 'INTs', pbu: 'Pass Breakups' },
        CB:  { tackles: 'Tackles', int: 'INTs', pbu: 'Pass Breakups' },
        S:   { tackles: 'Tackles', int: 'INTs', pbu: 'Pass Breakups' },
        K:   { att: 'FG Attempts', m: 'FGs Made', blk: 'Blocked', long: 'Long', pats: 'PATs' },
        P:   { att: 'Punts', long: 'Long', avg: 'Average', tb: 'Touchbacks', fc: 'Fair Catches', i20: 'Inside 20', '50+': '50+ Yard', blk: 'Blocked' },
        LS:  {}
    },

    // ========================================================
    // 5. STAT ALIASES — natural language → JSONB key
    // ========================================================
    statAliases: {
        'passing yards': 'pass_yds', 'pass yards': 'pass_yds', 'yards passing': 'pass_yds', 'threw for': 'pass_yds',
        'passing touchdowns': 'pass_tds', 'pass tds': 'pass_tds', 'td passes': 'pass_tds',
        'completion percentage': 'comp_%', 'completion rate': 'comp_%', 'accuracy': 'comp_%', 'comp %': 'comp_%',
        'rushing yards': 'rush_yds', 'rush yards': 'rush_yds', 'ran for': 'rush_yds',
        'rushing touchdowns': 'rush_tds', 'rush tds': 'rush_tds',
        'receptions': 'rec', 'catches': 'rec', 'caught': 'rec',
        'receiving yards': 'rec_yds', 'rec yards': 'rec_yds',
        'receiving touchdowns': 'rec_tds', 'rec tds': 'rec_tds',
        'interceptions thrown': 'ints', 'picks thrown': 'ints',
        'tackles': 'tackles', 'total tackles': 'tackles',
        'tackles for loss': 'tfls', 'tfl': 'tfls',
        'sacks': 'sacks',
        'pass breakups': 'pbu', 'passes defended': 'pbu',
        'forced fumbles': 'ff',
        'interceptions': 'int', 'picks': 'int',
        'field goals': 'm', 'field goals made': 'm',
        'extra points': 'pats',
        'punts': 'att', 'punt average': 'avg', 'inside 20': 'i20', 'touchbacks': 'tb'
    },

    // ========================================================
    // 6. SIZE & PHYSICAL DESCRIPTORS
    // ========================================================
    sizeTerms: {
        'big':        { heightAdj: '+2',  weightAdj: 'max' },
        'huge':       { heightAdj: '+3',  weightAdj: 'max+15' },
        'massive':    { heightAdj: '+3',  weightAdj: 'max+15' },
        'tall':       { heightAdj: '+3',  weightAdj: null },
        'long':       { heightAdj: '+3',  weightAdj: null },
        'short':      { heightAdj: 'min', weightAdj: null },
        'undersized': { heightAdj: 'min', weightAdj: 'min' },
        'thick':      { heightAdj: null,  weightAdj: 'max' },
        'stocky':     { heightAdj: null,  weightAdj: 'max' },
        'heavy':      { heightAdj: null,  weightAdj: 'max' },
        'lean':       { heightAdj: null,  weightAdj: 'min+10' },
        'light':      { heightAdj: null,  weightAdj: 'min' },
        'thin':       { heightAdj: null,  weightAdj: 'min' },
        'small':      { heightAdj: 'min', weightAdj: 'min' },
        'physical':   { heightAdj: null,  weightAdj: 'mid+' },
        'athletic':   { heightAdj: 'mid+', weightAdj: 'mid+' }
    },

    speedTerms: {
        'fast':      { weightAdj: 'lighter' },
        'quick':     { heightAdj: 'shorter', weightAdj: 'lighter' },
        'explosive': { heightAdj: 'mid+', weightAdj: 'mid+' },
        'speedy':    { weightAdj: 'lighter' },
        'burner':    { weightAdj: 'lighter' }
    },

    positionSpecificTerms: {
        QB: {
            'dual threat': { note: 'Implies rushing ability' },
            'pocket passer': { heightAdj: '+2', weightAdj: 'max' },
            'pro style': { heightAdj: '+2', weightAdj: 'max' },
            'scrambler': { weightAdj: 'lighter' },
            'mobile': { weightAdj: 'lighter' }
        },
        WR: {
            'slot': { heightAdj: 'min', weightAdj: 'lighter' },
            'outside': { heightAdj: '+2', weightAdj: 'max' },
            'x receiver': { heightAdj: '+2', weightAdj: 'max' },
            'deep threat': { heightAdj: '+2', weightAdj: 'lighter' },
            'possession': { weightAdj: 'max' }
        },
        RB: {
            'power back': { heightAdj: '+1', weightAdj: 'max' },
            'bruiser': { heightAdj: '+1', weightAdj: 'max' },
            'scat back': { heightAdj: 'min', weightAdj: 'lighter' },
            'speed back': { weightAdj: 'lighter' },
            'workhorse': { weightAdj: 'max' }
        },
        TE: {
            'receiving te': { weightAdj: 'lighter' },
            'blocking te': { heightAdj: '+1', weightAdj: 'max' },
            'mismatch': { heightAdj: '+2', weightAdj: 'lighter' }
        },
        DE: {
            'speed rusher': { heightAdj: '+1', weightAdj: 'lighter' },
            'power rusher': { weightAdj: 'max' },
            'tweener': { heightAdj: 'min', weightAdj: 'lighter' }
        },
        DT: {
            'nose tackle': { heightAdj: 'min', weightAdj: 'max' },
            'space eater': { weightAdj: 'max' },
            'penetrator': { weightAdj: 'lighter' }
        },
        ILB: {
            'thumper': { weightAdj: 'max' },
            'coverage lb': { weightAdj: 'lighter' },
            'sideline to sideline': { weightAdj: 'lighter' }
        },
        OLB: {
            'stand-up rusher': { heightAdj: '+1', weightAdj: 'mid+' },
            'hybrid': { heightAdj: 'mid+', weightAdj: 'mid+' }
        },
        CB: {
            'shutdown': { heightAdj: '+2' },
            'press corner': { heightAdj: '+1', weightAdj: 'mid+' },
            'nickel': { heightAdj: 'min', weightAdj: 'lighter' },
            'ball hawk': { note: 'Check INT stats' }
        },
        S: {
            'hard hitter': { weightAdj: 'max' },
            'free safety': { weightAdj: 'lighter' },
            'strong safety': { weightAdj: 'max' },
            'centerfield': { heightAdj: '+1', weightAdj: 'lighter' },
            'ball hawk': { note: 'Check INT stats' }
        }
    },

    // ========================================================
    // 7. RECRUITING TERMS
    // ========================================================
    recruitingTerms: {
        'ready now':     { graduation_year: 'current_class' },
        'sleeper':       { offers: 'count_max_2', metrics: 'meets_baseline' },
        'hidden gem':    { offers: 'count_max_2', metrics: 'meets_baseline' },
        'under the radar': { offers: 'count_max_1' },
        'local':         { state: 'coach_state' },
        'in-state':      { state: 'coach_state' },
        'out of state':  { state: 'not_coach_state' },
        'high ceiling':  { metrics: 'above_baseline' },
        'plug and play': { graduation_year: 'current_class', metrics: 'meets_baseline' },
        'day one starter': { graduation_year: 'current_class', metrics: 'above_baseline' }
    },

    // ========================================================
    // 8. ACADEMIC TERMS
    // ========================================================
    academicTerms: {
        'high gpa':         { min_gpa: 3.5 },
        'good grades':      { min_gpa: 3.0 },
        'strong academics': { min_gpa: 3.2, min_sat_score: 1200, min_act_score: 25 },
        'honor roll':       { min_gpa: 3.5 },
        'academic':         { min_gpa: 3.0 },
        'smart':            { min_gpa: 3.0 },
        'qualifies':        { min_gpa: 'coach_baseline' },
        'qualifier':        { min_gpa: 'coach_baseline' },
        'eligible':         { min_gpa: 'coach_baseline' },
        'high sat':         { min_sat_score: 1400 },
        'good sat':         { min_sat_score: 1200 },
        'high act':         { min_act_score: 30 },
        'good act':         { min_act_score: 25 }
    },

    // ========================================================
    // 9. CLASS / GRADUATION YEAR ALIASES
    // ========================================================
    classTerms: {
        'freshman':   { player_status: 'freshman' },
        'frosh':      { player_status: 'freshman' },
        'sophomore':  { player_status: 'sophomore' },
        'soph':       { player_status: 'sophomore' },
        'junior':     { player_status: 'junior' },
        'senior':     { player_status: 'senior' },
        '2025': { graduation_year: 2025 },
        '2026': { graduation_year: 2026 },
        '2027': { graduation_year: 2027 },
        '2028': { graduation_year: 2028 },
        '2029': { graduation_year: 2029 }
    },

    // ========================================================
    // 10. STATE ALIASES
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
        'michigan': 'Michigan', 'mi': 'Michigan',
        'minnesota': 'Minnesota', 'mn': 'Minnesota',
        'mississippi': 'Mississippi', 'ms': 'Mississippi',
        'missouri': 'Missouri', 'mo': 'Missouri',
        'montana': 'Montana', 'mt': 'Montana',
        'nebraska': 'Nebraska', 'ne': 'Nebraska',
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
        'pennsylvania': 'Pennsylvania', 'pa': 'Pennsylvania',
        'rhode island': 'Rhode Island', 'ri': 'Rhode Island',
        'south carolina': 'South Carolina', 'sc': 'South Carolina',
        'south dakota': 'South Dakota', 'sd': 'South Dakota',
        'tennessee': 'Tennessee', 'tn': 'Tennessee',
        'texas': 'Texas', 'tx': 'Texas',
        'utah': 'Utah', 'ut': 'Utah',
        'vermont': 'Vermont', 'vt': 'Vermont',
        'virginia': 'Virginia', 'va': 'Virginia',
        'washington': 'Washington', 'wa': 'Washington',
        'west virginia': 'West Virginia', 'wv': 'West Virginia',
        'wisconsin': 'Wisconsin', 'wi': 'Wisconsin',
        'wyoming': 'Wyoming', 'wy': 'Wyoming',
        'district of columbia': 'District of Columbia', 'dc': 'District of Columbia'
    },

    // ========================================================
    // 11. DIVISION ALIASES
    // ========================================================
    divisionAliases: {
        'fbs': 'D1 FBS', 'd1': 'D1 FBS', 'division 1': 'D1 FBS', 'division i': 'D1 FBS',
        'fcs': 'D1 FCS', '1-aa': 'D1 FCS', 'division 1-aa': 'D1 FCS',
        'd2': 'D2', 'division 2': 'D2', 'division ii': 'D2',
        'd3': 'D3', 'division 3': 'D3', 'division iii': 'D3',
        'naia': 'NAIA',
        'njcaa': 'NJCAA', 'juco': 'NJCAA', 'junior college': 'NJCAA', 'community college': 'NJCAA'
    },

    // ========================================================
    // 12. TRANSFER PORTAL TERMS
    // ========================================================
    transferTerms: {
        'transfer': { transfer: 'y' },
        'transfer portal': { transfer: 'y' },
        'portal': { transfer: 'y' },
        'in the portal': { transfer: 'y' },
        '1 year': { eligibility: 1 },
        '2 years': { eligibility: 2 },
        '3 years': { eligibility: 3 },
        '4 years': { eligibility: 4 },
        'immediate eligibility': { eligibility: 1 }
    },

    // ========================================================
    // 13. OFFER TERMS
    // ========================================================
    offerTerms: {
        'has offers': { has_any: true },
        'no offers': { has_any: false },
        'multiple offers': { count_min: 2 },
        'highly recruited': { count_min: 5 },
        'under the radar': { count_max: 1 },
        'hidden gem': { count_max: 2 },
        'sleeper': { count_max: 2 },
        // Division-specific offer terms
        'D1 offers': { division: 'D1 FBS', note: 'Also consider D1 FCS if coach says "D1" generically' },
        'FBS offers': { division: 'D1 FBS' },
        'FCS offers': { division: 'D1 FCS' },
        'D2 offers': { division: 'D2' },
        'D3 offers': { division: 'D3' },
        'NAIA offers': { division: 'NAIA' },
        'JUCO offers': { division: 'NJCAA' },
        'power conference offers': { division: 'D1 FBS', note: 'Closest filter available — cannot filter by conference' }
    },

    // Conference limitation — LLM instruction
    conferenceLimitation: {
        note: 'Cannot filter offers by conference (Big Ten, SEC, ACC, Big 12, Pac-12, etc.). Only by division level (D1 FBS, D1 FCS, D2, D3, NAIA, NJCAA). If a coach asks about a specific conference, tell them you can only filter by division and offer to do that instead.'
    },

    // ========================================================
    // 14. HIGHLIGHT / FILM TERMS
    // ========================================================
    highlightTerms: {
        'has film': 'has_highlights',
        'has highlights': 'has_highlights',
        'with film': 'has_highlights',
        'with highlights': 'has_highlights',
        'with video': 'has_highlights',
        'has hudl': 'has_highlights',
        'with hudl': 'has_highlights',
        'film available': 'has_highlights',
        'highlight film': 'has_highlights',
        'game film': 'has_highlights',
        'tape': 'has_highlights',
        'has tape': 'has_highlights',
        'with tape': 'has_highlights',
        'film on file': 'has_highlights',
        'watchable': 'has_highlights'
    },

    // ========================================================
    // 15. COMPARISON PATTERNS
    // ========================================================
    comparisonPatterns: [
        'at least {value} = >=',
        'at most {value} = <=',
        'over {value} = >',
        'under {value} = <',
        'taller than {value} = > height',
        'shorter than {value} = < height',
        'heavier than {value} = > weight',
        '{value}+ = >=',
        '{min} to {max} = range',
        'between {min} and {max} = range'
    ]
};

module.exports = RA_GLOSSARY;
