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

  const _meta = { model: 'local-mock', input_tokens: 0, output_tokens: 0, latency_ms: 0 };

  // If it looks like a greeting or general question, return conversational response
  if (content.match(/^(hi|hey|hello|sup|what can you|help)/)) {
    return {
      signal_filters: null,
      summary: null,
      message: 'Hey coach! I monitor player behavior patterns on Direct Recruit to help you spot potential portal candidates early — bio updates, highlight uploads, and coach browsing patterns. Just tell me what you\'re looking for.\n\n[LOCAL DEV - hardcoded sample response. Real AI is disabled.]',
      _meta
    };
  }

  // Return a sample signal filter response
  return {
    signal_filters: {
      signal_types: ['bio_and_film', 'portal_keywords', 'browsing_coaches'],
      position: null,
      state: null,
      college_division: coachDivision || null,
      min_height: null,
      max_height: null,
      min_weight: null,
      max_weight: null,
      min_gpa: null,
      max_gpa: null,
      min_sat_score: null,
      max_sat_score: null,
      min_act_score: null,
      max_act_score: null,
      graduation_year: null,
      max_graduation_year: null,
      eligibility: null,
      max_eligibility: null,
      track_100m_max: null,
      track_200m_max: null,
      pff_grade_min: null,
      pff_grade_max: null,
      days: 14
    },
    summary: '[LOCAL DEV] Sample search: All signal types, last 14 days',
    reasoning: '[LOCAL DEV - hardcoded sample response. Real AI is disabled. Connect an Anthropic API key in .env to enable real AI.]',
    _meta
  };
}

module.exports = { getPortalIntelligence, PORTAL_KEYWORDS };
