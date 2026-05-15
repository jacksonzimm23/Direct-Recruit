/**
 * Local development mock for Anthropic AI Recruiting Assistant.
 * Returns hardcoded sample responses so the UI works end-to-end.
 * Production is NOT affected — this file is only loaded when NODE_ENV !== 'production'.
 */

async function getRecruitingFilters(messages, coachBaselines, coachState, coachDivision) {
  const lastMessage = messages[messages.length - 1];
  const content = lastMessage ? lastMessage.content.toLowerCase() : '';

  const _meta = { model: 'local-mock', input_tokens: 0, output_tokens: 0, latency_ms: 0 };

  // If it looks like a greeting or general question, return conversational response
  if (content.match(/^(hi|hey|hello|sup|what can you|help)/)) {
    return {
      filters: null,
      summary: null,
      message: 'Hey coach! I can help you find high school players and transfer portal talent. Just tell me what you\'re looking for — position, size, state, stats, GPA — and I\'ll find players that fit.\n\n[LOCAL DEV - hardcoded sample response. Real AI is disabled.]',
      _meta
    };
  }

  // Return a sample filter response for any search query
  return {
    filters: {
      player_type: 'hs',
      position: ['QB', 'WR'],
      state: coachState || null,
      graduation_year: 2027,
      min_height: 72,
      max_height: null,
      min_weight: 180,
      max_weight: null,
      min_gpa: 3.0,
      college_division: null,
      eligibility: null,
      searchTerm: null,
      other_sports: null,
      plays_other_sports: null,
      track_100m_max: null,
      track_200m_max: null,
      pff_grade_min: null,
      stat_filters: []
    },
    summary: '[LOCAL DEV] Sample search: HS QBs and WRs, class of 2027, 6\'0"+, 180+ lbs, 3.0+ GPA',
    reasoning: '[LOCAL DEV - hardcoded sample response. Real AI is disabled. Connect an Anthropic API key in .env to enable real AI.]',
    _meta
  };
}

module.exports = { getRecruitingFilters };
