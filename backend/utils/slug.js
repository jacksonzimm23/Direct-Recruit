const crypto = require('crypto');

// Convert a team name to a URL-safe kebab-case prefix.
//   "Colorado School of Mines" -> "colorado-school-of-mines"
//   "Texas A&M"               -> "texas-a-m"
//   "" / null                 -> "team"
// Capped at 40 chars so the full slug fits well under the VARCHAR(64) column.
function kebabCase(input) {
  if (!input || typeof input !== 'string') return 'team';
  const cleaned = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!cleaned) return 'team';
  return cleaned.slice(0, 40).replace(/-+$/g, '') || 'team';
}

// Generate a candidate slug: "<kebab-team-name>-<6 hex chars>".
// Example: "colorado-school-of-mines-a7f2a9"
function generateSlug(teamName) {
  const prefix = kebabCase(teamName);
  const suffix = crypto.randomBytes(3).toString('hex'); // 6 hex chars
  return `${prefix}-${suffix}`;
}

module.exports = { kebabCase, generateSlug };
