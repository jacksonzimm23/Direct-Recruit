/**
 * Local development mock for Anthropic AI Portal Intelligence.
 * Returns hardcoded sample responses so the UI works end-to-end.
 * Production is NOT affected — this file is only loaded when NODE_ENV !== 'production'.
 */

// Must export PORTAL_KEYWORDS — imported by PortalSignal.js model
const PORTAL_KEYWORDS = [
  'transfer', 'portal', 'eligible', 'eligibility',
  'looking for new opportunity', 'open to opportunities',
  'exploring options', 'new chapter', 'fresh start',
  'available', 'seeking', 'next step', 'ready for change',
  'new home', 'looking to transfer', 'entering the portal',
  'committed to growth', 'open to new', 'exploring my options',
  'new beginning', 'moving on', 'ready for a new',
  'weighing my options', 'considering my options',
  'in the portal', 'portal entry', 'immediate eligibility',
  'grad transfer', 'one time transfer'
];

async function getPortalIntelligence(messages, coachState, coachDivision) {
  const lastMessage = messages[messages.length - 1];
  const content = lastMessage ? lastMessage.content.toLowerCase() : '';

  // If it looks like a greeting or general question, return conversational response
  if (content.match(/^(hi|hey|hello|sup|what can you|help)/)) {
    return {
      signal_filters: null,
      summary: null,
      message: 'Hey coach! I monitor player behavior patterns on Direct Recruit to help you spot potential portal candidates early — bio updates, highlight uploads, and coach browsing patterns. Just tell me what you\'re looking for.\n\n[LOCAL DEV - hardcoded sample response. Real AI is disabled.]'
    };
  }

  // Return a sample signal filter response
  return {
    signal_filters: {
      signal_types: ['bio_and_film', 'portal_keywords', 'browsing_coaches'],
      position: null,
      college_division: coachDivision || null,
      days: 14
    },
    summary: '[LOCAL DEV] Sample search: All signal types, last 14 days',
    reasoning: '[LOCAL DEV - hardcoded sample response. Real AI is disabled. Connect an Anthropic API key in .env to enable real AI.]'
  };
}

module.exports = { getPortalIntelligence, PORTAL_KEYWORDS };
