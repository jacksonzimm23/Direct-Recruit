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

  // Return a sample filter response for any search query.
  const filters = {
    player_type: 'hs',
    position: ['QB', 'WR'],
    state: coachState || null,
    graduation_year: 2027,
    max_graduation_year: null,
    min_height: 72,
    max_height: null,
    min_weight: 180,
    max_weight: null,
    min_gpa: 3.0,
    max_gpa: null,
    min_sat_score: null,
    max_sat_score: null,
    min_act_score: null,
    max_act_score: null,
    college_division: null,
    eligibility: null,
    max_eligibility: null,
    searchTerm: null,
    other_sports: null,
    plays_other_sports: null,
    track_100m_max: null,
    track_200m_max: null,
    pff_grade_min: null,
    pff_grade_max: null,
    stat_filters: []
  };

  // Plan 7E: detect recruiting-profile (fit) FIELD phrases so the new NL filters are
  // testable on the local mock (real AI does this via the prompt + glossary).
  detectFitFieldFilters(content, filters);

  return {
    filters,
    summary: '[LOCAL DEV] Sample search: HS QBs and WRs, class of 2027, 6\'0"+, 180+ lbs, 3.0+ GPA',
    reasoning: '[LOCAL DEV - hardcoded sample response. Real AI is disabled. Connect an Anthropic API key in .env to enable real AI.]',
    _meta
  };
}

// Shared fit-field phrase detection for the local RA + PI mocks (Plan 7E).
// Mutates `filters` in place, adding the new keys when phrases are present.
// Values are canonical (match-constants.js) so the SQL overlap/equality matches.
function detectFitFieldFilters(content, filters) {
  const c = (content || '').toLowerCase();
  // intended_major
  if (c.includes('engineering')) filters.intended_major = ['Mechanical Engineering', 'Civil Engineering', 'Electrical Engineering', 'General Engineering'];
  else if (c.includes('computer science') || c.includes(' cs ')) filters.intended_major = ['Computer Science'];
  else if (c.includes('business')) filters.intended_major = ['Business Administration', 'Finance', 'Marketing', 'Accounting', 'Management', 'Economics', 'Entrepreneurship'];
  else if (c.includes('nursing')) filters.intended_major = ['Nursing'];
  else if (c.includes('pre-med') || c.includes('premed')) filters.intended_major = ['Pre-Med / Health Sciences'];
  else if (c.includes('kinesiology') || c.includes('exercise science')) filters.intended_major = ['Kinesiology / Exercise Science'];
  // levels_open
  const levels = [];
  if (c.includes('open to d2') || c.includes('open to division 2')) levels.push('D2');
  if (c.includes('open to d3')) levels.push('D3');
  if (c.includes('open to fbs')) levels.push('D1 FBS');
  if (c.includes('open to fcs')) levels.push('D1 FCS');
  if (c.includes('open to naia')) levels.push('NAIA');
  if (c.includes('open to njcaa') || c.includes('open to juco')) levels.push('NJCAA');
  if (levels.length) filters.levels_open = levels;
  // preferred_regions
  if (c.includes('west coast')) filters.preferred_regions = ['Pacific'];
  else if (c.includes('southeast')) filters.preferred_regions = ['Southeast'];
  else if (c.includes('northeast')) filters.preferred_regions = ['Northeast'];
  else if (c.includes('midwest')) filters.preferred_regions = ['Midwest'];
  // preferred_campus_setting
  if (c.includes('big city') || c.includes('urban')) filters.preferred_campus_setting = 'urban';
  else if (c.includes('rural') || c.includes('country')) filters.preferred_campus_setting = 'rural';
  else if (c.includes('small town') || c.includes('college town')) filters.preferred_campus_setting = 'small-town';
  else if (c.includes('suburban') || c.includes('suburb')) filters.preferred_campus_setting = 'suburban';
  // aid needs
  if (c.includes('needs a scholarship') || c.includes('needs scholarship')) filters.needs_scholarship = 'yes';
  if (c.includes('needs financial aid') || c.includes('needs aid')) filters.needs_financial_aid = 'yes';
}

module.exports = { getRecruitingFilters, detectFitFieldFilters };
