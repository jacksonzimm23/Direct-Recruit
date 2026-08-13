// ============================================================
// MATCH CONSTANTS — AI Fit-Matching shared vocabulary (Frontend Copy)
// ============================================================
// Canonical lists + enums shared by the player and college-coach
// profile forms and (later) the AI fit-scoring engine. These are the
// MATCHED-PAIR vocabularies: a player's intended_major must be a
// string-identical member of the same MAJOR list a coach picks from,
// or the major-fit dimension scores zero (see match.md, lesson #19).
//
// The backend twin lives at: backend/utils/match-constants.js
// Keep both in sync when making changes — the MATCH_CONSTANTS object
// must be identical in both files; only the export tail differs.
// (The backend twin also derives VALID_* allowlist Sets for validation;
// those are backend-only and intentionally NOT part of this object.)
//
// Loaded via plain <script src="../shared/match-constants.js"> (no build
// step). Exposed as window.MATCH_CONSTANTS for consuming form scripts.
// ============================================================

const MATCH_CONSTANTS = {

  // ========================================================
  // Majors — GROUPED so the same structure drives the grouped-checkbox
  // UI (one fieldset per group) and the backend's flat allowlist.
  // 53 majors, 9 groups. Used by: player intended_major /
  // coach top_programs + football_player_majors.
  // ========================================================
  MAJOR_GROUPS: [
    {
      group: 'Business',
      majors: [
        'Business Administration', 'Finance', 'Marketing', 'Accounting',
        'Management', 'Economics', 'Sports Management', 'Entrepreneurship'
      ]
    },
    {
      group: 'Communications & Media',
      majors: [
        'Communications', 'Journalism', 'Public Relations', 'Media / Film Studies'
      ]
    },
    {
      group: 'Health & Sport Sciences',
      majors: [
        'Kinesiology / Exercise Science', 'Athletic Training', 'Sports Medicine',
        'Nursing', 'Physical Therapy (Pre-PT)', 'Public Health', 'Nutrition / Dietetics'
      ]
    },
    {
      group: 'Social Sciences',
      majors: [
        'Psychology', 'Sociology', 'Political Science', 'Criminal Justice',
        'Social Work', 'Anthropology'
      ]
    },
    {
      group: 'Education',
      majors: [
        'Education', 'Physical Education', 'Special Education'
      ]
    },
    {
      group: 'STEM – Engineering & Computing',
      majors: [
        'Mechanical Engineering', 'Civil Engineering', 'Electrical Engineering',
        'General Engineering', 'Computer Science', 'Information Technology', 'Data Science'
      ]
    },
    {
      group: 'STEM – Sciences & Math',
      majors: [
        'Biology', 'Chemistry', 'Environmental Science', 'Mathematics',
        'Pre-Med / Health Sciences'
      ]
    },
    {
      group: 'Arts & Humanities',
      majors: [
        'English', 'History', 'Philosophy', 'Liberal Arts / General Studies',
        'Art / Graphic Design', 'Music'
      ]
    },
    {
      group: 'Pre-Professional & Other',
      majors: [
        'Pre-Law', 'Agriculture', 'Architecture', 'Hospitality / Tourism Management',
        'Construction Management', 'Aviation', 'Undecided'
      ]
    }
  ],

  // ========================================================
  // Geography — named 6-region vocabulary for the player's
  // preferred_regions. REGION_BY_STATE maps a coach's full-name
  // `state` to its region so the fit engine can compare
  // player.preferred_regions ∋ region_of(coach.state).
  // Keyed by FULL state name (coach_profiles.state stores full names).
  // ========================================================
  REGIONS: ['Northeast', 'Southeast', 'Midwest', 'South Central', 'West', 'Pacific'],

  REGION_BY_STATE: {
    // Northeast
    'Connecticut': 'Northeast', 'Maine': 'Northeast', 'Massachusetts': 'Northeast',
    'New Hampshire': 'Northeast', 'Rhode Island': 'Northeast', 'Vermont': 'Northeast',
    'New Jersey': 'Northeast', 'New York': 'Northeast', 'Pennsylvania': 'Northeast',
    // Southeast
    'Delaware': 'Southeast', 'Florida': 'Southeast', 'Georgia': 'Southeast',
    'Maryland': 'Southeast', 'North Carolina': 'Southeast', 'South Carolina': 'Southeast',
    'Virginia': 'Southeast', 'West Virginia': 'Southeast', 'District of Columbia': 'Southeast',
    'Alabama': 'Southeast', 'Kentucky': 'Southeast', 'Mississippi': 'Southeast',
    'Tennessee': 'Southeast',
    // Midwest
    'Illinois': 'Midwest', 'Indiana': 'Midwest', 'Michigan': 'Midwest', 'Ohio': 'Midwest',
    'Wisconsin': 'Midwest', 'Iowa': 'Midwest', 'Kansas': 'Midwest', 'Minnesota': 'Midwest',
    'Missouri': 'Midwest', 'Nebraska': 'Midwest', 'North Dakota': 'Midwest',
    'South Dakota': 'Midwest',
    // South Central
    'Arkansas': 'South Central', 'Louisiana': 'South Central', 'Oklahoma': 'South Central',
    'Texas': 'South Central',
    // West
    'Arizona': 'West', 'Colorado': 'West', 'Idaho': 'West', 'Montana': 'West',
    'Nevada': 'West', 'New Mexico': 'West', 'Utah': 'West', 'Wyoming': 'West',
    // Pacific
    'Alaska': 'Pacific', 'California': 'Pacific', 'Hawaii': 'Pacific', 'Oregon': 'Pacific',
    'Washington': 'Pacific'
  },

  // ========================================================
  // Shared categorical vocabularies (stored as VARCHAR; validated
  // backend-side by the derived VALID_* Sets — no DB ENUM/CHECK).
  // ========================================================

  // Player preferred_campus_setting + coach campus_setting share this
  // exact list so the campus-fit dimension compares like-to-like.
  CAMPUS_SETTINGS: ['urban', 'suburban', 'rural', 'small-town'],

  // Player-ONLY extra value for preferred_campus_setting: an explicit "I'm open
  // to any campus setting" answer. Deliberately NOT in CAMPUS_SETTINGS, because
  // that list is shared with the coach's campus_setting and a real campus is
  // never "no preference". null = unanswered, 'no-preference' = answered.
  NO_CAMPUS_PREFERENCE: 'no-preference',

  // Player levels_open — matched against coach college_division.
  LEVELS: ['D1 FBS', 'D1 FCS', 'D2', 'D3', 'NAIA', 'NJCAA'],

  // Player needs_financial_aid / needs_scholarship.
  YES_NO_UNSURE: ['yes', 'no', 'unsure'],

  // Coach affordability_band.
  AFFORDABILITY_BANDS: ['low', 'mid', 'high'],

  // Coach offers_athletic_aid.
  ATHLETIC_AID_OPTIONS: ['full', 'partial', 'none'],

  // Coach aid_generosity.
  AID_GENEROSITY: ['need-met', 'strong', 'limited'],

  // Coach distance_profile (how far the program recruits).
  DISTANCE_PROFILES: ['local', 'regional', 'national'],

  // Coach hs_tier_recruited.
  HS_TIERS: ['elite', 'strong', 'developmental'],

  // Coach fit_preferences.roster_pct_on_aid.
  ROSTER_PCT_ON_AID: ['none', 'some', 'most'],

  // Coach fit_preferences.academic_support.
  ACADEMIC_SUPPORT: ['none', 'standard', 'strong'],

  // Coach fit_preferences.affiliation (string[], optional).
  AFFILIATIONS: ['Public', 'Private', 'Faith-based', 'HBCU', 'Military'],

  // Coach fit_preferences.offensive_scheme / defensive_scheme.
  SCHEMES_OFFENSE: ['Air Raid', 'Pro-Style', 'Spread', 'Option', 'RPO', 'Multiple'],
  SCHEMES_DEFENSE: ['4-3', '3-4', 'Multiple', '4-2-5', '3-3-5'],

  // Importance sliders (players) + dev_vs_plug_and_play (coach) live in
  // fit_preferences as integers on this 1–5 scale.
  SLIDER_SCALE: { min: 1, max: 5 }
};

if (typeof window !== 'undefined') {
  window.MATCH_CONSTANTS = MATCH_CONSTANTS;
}
