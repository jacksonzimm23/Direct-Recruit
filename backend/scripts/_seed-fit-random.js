// TEMP local-only: generate UPDATE SQL to populate realistic RANDOM fit-matching
// fields on every seeded player, so the fit engine can be calibrated on a real
// distribution. Prints SQL to stdout; pipe into Docker psql. Idempotent (plain
// UPDATEs). Uses canonical values from match-constants so everything validates.
// NOT in the seed MIGRATIONS array. Delete after calibration.
//
// Usage: node backend/scripts/_seed-fit-random.js > <tmp>.sql  then psql -f
const M = require('../utils/match-constants');

const ALL_MAJORS = M.MAJOR_GROUPS.flatMap(g => g.majors);
const REGIONS = M.REGIONS;
const LEVELS = M.LEVELS;
const CAMPUS = M.CAMPUS_SETTINGS;
const YNU = M.YES_NO_UNSURE;

// deterministic-ish PRNG seeded per-index so re-runs are stable (no Math.random
// requirement here — this is a generator script, not the workflow runtime).
function rng(seed) { let s = seed % 2147483647; if (s <= 0) s += 2147483646; return () => (s = s * 16807 % 2147483647) / 2147483647; }
const pick = (r, a) => a[Math.floor(r() * a.length)];
const pickN = (r, a, n) => { const c = [...a], out = []; for (let i = 0; i < n && c.length; i++) out.push(c.splice(Math.floor(r() * c.length), 1)[0]); return out; };
const sqlArr = (a) => `ARRAY[${a.map(x => `'${x.replace(/'/g, "''")}'`).join(',')}]::text[]`;
const lit = (v) => v == null ? 'NULL' : (typeof v === 'number' ? v : `'${String(v).replace(/'/g, "''")}'`);

// We UPDATE by user_id pulled at runtime via a sub-select on a row_number, so this
// script just emits one UPDATE per player using a CTE over all players. Simpler:
// emit a single UPDATE using a FROM (VALUES ...) mapping by ordinal isn't stable.
// Instead: UPDATE each player_profiles row deterministically from its id hash.
// Easiest robust approach: a PL/pgSQL DO block that loops every row and sets
// pseudo-random-but-valid values using the row's ctid/id. Emit that.

const majorsJson = JSON.stringify(ALL_MAJORS);
const regionsJson = JSON.stringify(REGIONS);
const levelsJson = JSON.stringify(LEVELS);
const campusJson = JSON.stringify(CAMPUS);
const ynuJson = JSON.stringify(YNU);

// Build a DO block: for each player, derive an index from a hashtext of id, then
// pick valid values. fit_preferences sliders 1..5.
console.log(`
DO $$
DECLARE
  r RECORD;
  h INT;
  majors TEXT[] := ARRAY(SELECT jsonb_array_elements_text('${majorsJson}'::jsonb));
  regions TEXT[] := ARRAY(SELECT jsonb_array_elements_text('${regionsJson}'::jsonb));
  levels TEXT[] := ARRAY(SELECT jsonb_array_elements_text('${levelsJson}'::jsonb));
  campus TEXT[] := ARRAY(SELECT jsonb_array_elements_text('${campusJson}'::jsonb));
  ynu TEXT[] := ARRAY(SELECT jsonb_array_elements_text('${ynuJson}'::jsonb));
  nmaj INT; chosen_majors TEXT[]; nlev INT; chosen_levels TEXT[]; nreg INT; chosen_regions TEXT[];
BEGIN
  FOR r IN SELECT id FROM player_profiles LOOP
    h := abs(hashtext(r.id::text));
    -- 1..3 majors
    nmaj := 1 + (h % 3);
    chosen_majors := ARRAY(SELECT m FROM unnest(majors) WITH ORDINALITY AS t(m, o) ORDER BY (h * o) % 97 LIMIT nmaj);
    -- 2..4 levels
    nlev := 2 + (h % 3);
    chosen_levels := ARRAY(SELECT l FROM unnest(levels) WITH ORDINALITY AS t(l, o) ORDER BY (h * o + 7) % 89 LIMIT nlev);
    -- 1..3 regions
    nreg := 1 + ((h / 3) % 3);
    chosen_regions := ARRAY(SELECT rg FROM unnest(regions) WITH ORDINALITY AS t(rg, o) ORDER BY (h * o + 13) % 83 LIMIT nreg);

    UPDATE player_profiles SET
      weighted_gpa = LEAST(6.0, ROUND((COALESCE(gpa,3.0) + ((h % 60)/100.0))::numeric, 2)),
      has_ap_ib = (h % 2 = 0),
      ap_ib_count = CASE WHEN h % 2 = 0 THEN (h % 8) ELSE NULL END,
      class_rank = 'Top ' || (5 + (h % 40)) || '%',
      intended_major = chosen_majors,
      home_zip = LPAD(((h % 90000) + 10000)::text, 5, '0'),
      needs_financial_aid = ynu[1 + (h % 3)],
      needs_scholarship = ynu[1 + ((h / 2) % 3)],
      pell_or_first_gen = (h % 3 = 0),
      levels_open = chosen_levels,
      preferred_regions = chosen_regions,
      preferred_campus_setting = campus[1 + (h % 4)],
      fit_preferences = jsonb_build_object(
        'importance_playing_time', 1 + (h % 5),
        'importance_close_to_home', 1 + ((h/2) % 5),
        'importance_academics_vs_football', 1 + ((h/3) % 5),
        'importance_competition_level', 1 + ((h/4) % 5),
        'looking_for_text', 'Looking for the right program fit.'
      )
    WHERE id = r.id;
  END LOOP;
  RAISE NOTICE 'Updated % player rows with random fit data', (SELECT COUNT(*) FROM player_profiles);
END $$;
`);
