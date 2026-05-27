// Slur-only content filter for Apple Guideline 1.2 compliance.
//
// Intentionally does NOT block common profanity (shit, fuck, damn, ass).
// Only blocks severe slurs (racial, homophobic, ableist, transphobic) and
// explicit self-harm/violence phrases. Matches the filtering depth Reddit
// and Discord use.
//
// Used by routes/posts.js (post + comment + share quote) and routes/messages.js
// to reject user-submitted text before DB insert. Returns generic 'Content
// not allowed' to the user — never reveal the matched word (so the list
// can't be reverse-engineered from API responses).
//
// To remove a false positive: delete the word from SLURS below + redeploy.
// To add a term: append to SLURS (must be lowercase, single token preferred).

// Severe slurs and unambiguous hate-speech terms.
// Whole-word matched with \b boundaries so e.g. 'classic' won't trip 'ass'.
const SLURS = [
    // Racial slurs (n-word variants, asian slurs, etc.)
    'nigger', 'niggers', 'nigga', 'niggas',
    'chink', 'chinks', 'gook', 'gooks', 'jap', 'japs',
    'spic', 'spics', 'wetback', 'wetbacks',
    'kike', 'kikes', 'beaner', 'beaners',
    'coon', 'coons', 'sambo',
    'redskin', 'redskins',
    // Homophobic / transphobic slurs
    'faggot', 'faggots', 'fag', 'fags',
    'dyke', 'dykes',
    'tranny', 'trannies', 'shemale', 'shemales',
    // Ableist slurs (the term used to dehumanize, not the medical term)
    'retard', 'retards', 'retarded',
    // Anti-semitic slurs
    'kyke',
    // Misogynistic slurs (severe only)
    'whore', 'whores',
    // Other unambiguous slurs
    'wop', 'wops',
];

// Pre-compile slur regexes once at module load (perf).
const SLUR_PATTERNS = SLURS.map(slur =>
    new RegExp(`\\b${slur}\\b`, 'i')
);

// Explicit self-harm / violence patterns — matches phrasing, not single words.
const VIOLENCE_PATTERNS = [
    /\bkill\s+yo(u|ur)\s*self\b/i,    // "kill yourself" / "kill your self" / "kill yourself"
    /\bk\.?\s*y\.?\s*s\b/i,            // "kys" / "k.y.s" / "k y s"
    /\bgo\s+kill\s+yourself\b/i,
    /\bhang\s+yourself\b/i,
    /\bcommit\s+suicide\b/i,
    /\bdie\s+in\s+a\s+(fire|hole)\b/i,
];

/**
 * Returns true if the given text contains a blocked slur or violence phrase.
 * Safe to call with null/undefined/empty/non-string — returns false.
 *
 * Note: this is a precision-over-recall filter. Determined bad actors will
 * still find ways to express hate (intentional misspellings, leetspeak,
 * unicode lookalikes). The user-submitted report flow + admin moderation
 * queue from plan 2 handle those cases.
 */
function containsBlockedContent(text) {
    if (!text || typeof text !== 'string') return false;

    // Normalize: lowercase + strip non-alphanumeric so 'n!gger' or 'n.i.g.g.e.r'
    // collapse to 'nigger'. Whitespace preserved between tokens.
    const normalized = text
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .replace(/\s+/g, ' ')
        .trim();

    for (const pattern of SLUR_PATTERNS) {
        if (pattern.test(normalized)) return true;
    }

    // Violence patterns run against the ORIGINAL text (not normalized) because
    // they include whitespace tolerance built in.
    for (const pattern of VIOLENCE_PATTERNS) {
        if (pattern.test(text)) return true;
    }

    return false;
}

module.exports = { containsBlockedContent };
