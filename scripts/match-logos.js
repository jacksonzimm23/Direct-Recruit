/**
 * match-logos.js
 *
 * Fuzzy-matches school names from school_assets.csv to logo filenames
 * in frontend/assets/logos/, then outputs a combined JSON mapping.
 *
 * Usage: node scripts/match-logos.js
 */

const fs = require('fs');
const path = require('path');

// --- Config ---
const CSV_PATH = path.join(__dirname, '..', 'school_assets.csv');
const LOGOS_DIR = path.join(__dirname, '..', 'frontend', 'assets', 'logos');
const OUTPUT_PATH = path.join(__dirname, '..', 'frontend', 'assets', 'school-logos.json');

// --- Parse CSV ---
function parseCSV(text) {
  const lines = text.split('\n');
  const header = lines[0];
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Handle quoted fields (some school names have commas)
    const fields = [];
    let current = '';
    let inQuotes = false;
    for (const char of line) {
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        fields.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    fields.push(current.trim());

    rows.push({
      schoolName: fields[0],
      division: fields[3] || ''
    });
  }
  return rows;
}

// --- Normalize a name for matching ---
function normalize(name) {
  return name
    .toLowerCase()
    .replace(/['']/g, "'")                    // normalize apostrophes
    .replace(/university of |university at |university /gi, '')
    .replace(/college of |college /gi, '')
    .replace(/united states military academy/gi, 'army')
    .replace(/united states naval academy/gi, 'navy')
    .replace(/united states air force academy/gi, 'air force')
    .replace(/united states coast guard academy/gi, 'united states coast guard')
    .replace(/united states merchant marine academy/gi, 'united states merchant marine')
    .replace(/\(([^)]+)\)/g, ' $1 ')          // extract parenthetical as alternate name
    .replace(/[^a-z0-9&' ]/g, ' ')            // keep &, apostrophes, alphanumeric
    .replace(/\s+/g, ' ')
    .trim();
}

// Turn a name into underscore slug (like the logo filenames)
function slugify(name) {
  return name
    .toLowerCase()
    .replace(/['']/g, "'")
    .replace(/[^a-z0-9&' ]/g, ' ')
    .replace(/\s+/g, '_')
    .trim();
}

// --- Similarity scoring ---
function getWords(str) {
  return str.toLowerCase().replace(/[^a-z0-9&']/g, ' ').split(/\s+/).filter(Boolean);
}

function wordOverlapScore(a, b) {
  const wordsA = new Set(getWords(a));
  const wordsB = new Set(getWords(b));
  let matches = 0;
  for (const w of wordsA) {
    if (wordsB.has(w)) matches++;
  }
  // Jaccard-like score weighted toward the logo name (since it's shorter/more specific)
  return matches / Math.max(wordsB.size, 1);
}

// Simple Levenshtein distance
function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

function combinedScore(csvName, logoStem) {
  const normCSV = normalize(csvName);
  const normLogo = logoStem.replace(/_/g, ' ');

  // Exact slug match
  if (slugify(normCSV) === logoStem || slugify(csvName) === logoStem) return 1000;

  // Check if parenthetical nickname matches logo exactly
  const parenMatch = csvName.match(/\(([^)]+)\)/);
  if (parenMatch) {
    const nickname = slugify(parenMatch[1]);
    if (nickname === logoStem) return 999;
  }

  const wordScore = wordOverlapScore(normCSV, normLogo);
  const editDist = levenshtein(normCSV.replace(/\s/g, ''), normLogo.replace(/\s/g, ''));
  const maxLen = Math.max(normCSV.length, normLogo.length);
  const editScore = 1 - (editDist / maxLen);

  // Also check if logo words are a subset contained in CSV name
  const logoWords = getWords(normLogo);
  const csvWords = new Set(getWords(normCSV));
  const containsAll = logoWords.every(w => csvWords.has(w));

  return (wordScore * 50) + (editScore * 30) + (containsAll ? 20 : 0);
}

// --- Manual overrides for known matches the algorithm can't get ---
const MANUAL_OVERRIDES = {
  'Appalachian State University': 'appalachin_state.png',
  'Concordia University, Saint Paul': 'concordia_st_paul.png',
  "University of Virginia's College at Wise (UVA Wise)": 'uva_wise_virginia.png',
  "King's College - Pennsylvania": 'kings_pennsylvania.png',
  'Concordia University-Nebraska': null,  // no logo
  'University of Saint Francis (IN)': null, // different from PA
  'Concordia College - Minnesota': 'concordia_minnesota.png',
  'Concordia University - Chicago': 'concordia_chicago.png',
  "Saint John's University - Minnesota": 'saint_johns_minnesota.png',
  'California University of Pennsylvania': 'pennsylvania_california.png',
  'Wayne State University (Michigan)': 'wayne_michigan.png',
  'Wheaton College - Illinois': 'wheaton.png',
  'Cornell College (Iowa)': 'cornell_college.png',
};

// --- Main ---
function main() {
  const csvText = fs.readFileSync(CSV_PATH, 'utf-8');
  const schools = parseCSV(csvText);

  const logoFiles = fs.readdirSync(LOGOS_DIR).filter(f => /\.(png|jpg|jpeg|svg|webp)$/i.test(f));
  const logoStems = logoFiles.map(f => ({
    filename: f,
    stem: f.replace(/\.[^.]+$/, '')
  }));

  const results = [];
  const usedLogos = new Set();
  const unmatched = [];
  const lowConfidence = [];

  // Divisions that should NOT have logos
  const EXCLUDED_DIVISIONS = new Set(['NAIA', 'NJCAA']);

  for (const school of schools) {
    // Skip logo matching for NAIA/NJCAA schools
    if (EXCLUDED_DIVISIONS.has(school.division)) {
      results.push({
        schoolName: school.schoolName,
        division: school.division,
        logoFile: null,
        confidence: 'none'
      });
      continue;
    }

    // Check manual overrides first
    if (school.schoolName in MANUAL_OVERRIDES) {
      const overrideLogo = MANUAL_OVERRIDES[school.schoolName];
      results.push({
        schoolName: school.schoolName,
        division: school.division,
        logoFile: overrideLogo,
        confidence: overrideLogo ? 'exact' : 'none'
      });
      if (overrideLogo) usedLogos.add(overrideLogo);
      else unmatched.push(school.schoolName);
      continue;
    }

    let bestScore = -1;
    let bestLogo = null;

    for (const logo of logoStems) {
      const score = combinedScore(school.schoolName, logo.stem);
      if (score > bestScore) {
        bestScore = score;
        bestLogo = logo;
      }
    }

    // Raise threshold to 70 to eliminate false positives
    if (bestScore >= 70 && bestLogo) {
      results.push({
        schoolName: school.schoolName,
        division: school.division,
        logoFile: bestLogo.filename,
        confidence: bestScore >= 999 ? 'exact' : bestScore >= 70 ? 'high' : 'medium'
      });

      if (bestScore < 70) {
        lowConfidence.push({
          schoolName: school.schoolName,
          matchedTo: bestLogo.filename,
          score: bestScore.toFixed(1)
        });
      }

      usedLogos.add(bestLogo.filename);
    } else {
      results.push({
        schoolName: school.schoolName,
        division: school.division,
        logoFile: null,
        confidence: 'none'
      });
      unmatched.push(school.schoolName);
    }
  }

  // Unmatched logos (logos with no CSV school)
  const unmatchedLogos = logoFiles.filter(f => !usedLogos.has(f));

  // --- Output JSON mapping ---
  const mapping = {};
  for (const r of results) {
    mapping[r.schoolName] = {
      division: r.division,
      logo: r.logoFile,
      confidence: r.confidence
    };
  }
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(mapping, null, 2));

  // --- Report ---
  const matched = results.filter(r => r.logoFile);
  console.log(`\n=== Logo Matching Results ===`);
  console.log(`Total schools in CSV: ${schools.length}`);
  console.log(`Total logo files: ${logoFiles.length}`);
  console.log(`Matched: ${matched.length}`);
  console.log(`  - Exact/nickname match: ${results.filter(r => r.confidence === 'exact').length}`);
  console.log(`  - High confidence: ${results.filter(r => r.confidence === 'high').length}`);
  console.log(`  - Medium confidence: ${results.filter(r => r.confidence === 'medium').length}`);
  console.log(`No match found: ${unmatched.length}`);
  console.log(`Unused logos (no CSV school): ${unmatchedLogos.length}`);

  if (lowConfidence.length > 0) {
    console.log(`\n--- Medium confidence matches (REVIEW THESE) ---`);
    for (const lc of lowConfidence) {
      console.log(`  "${lc.schoolName}" → ${lc.matchedTo} (score: ${lc.score})`);
    }
  }

  if (unmatched.length > 0) {
    console.log(`\n--- Schools with no logo match ---`);
    for (const u of unmatched) {
      console.log(`  ${u}`);
    }
  }

  if (unmatchedLogos.length > 0) {
    console.log(`\n--- Logo files with no CSV match ---`);
    for (const u of unmatchedLogos) {
      console.log(`  ${u}`);
    }
  }

  console.log(`\nOutput written to: ${OUTPUT_PATH}`);
}

main();
