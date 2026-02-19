const express = require('express');
const router = express.Router();
const { authMiddleware, requireRole, validateUUID } = require('../middleware/auth');
const AiChat = require('../models/AiChat');
const PlayerProfile = require('../models/PlayerProfile');
const CoachProfile = require('../models/CoachProfile');
const { getRecruitingFilters } = require('../utils/ai');
const { getSignedS3Url } = require('../utils/s3');
const PlayerGameStats = require('../models/PlayerGameStats');

// Helper: add signed URLs to player profiles (same pattern as profile.js)
async function addSignedUrlsToProfiles(players) {
  return Promise.all(players.map(async (player) => {
    if (player.profile_image_url) {
      player.profile_image_url = await getSignedS3Url(player.profile_image_url);
    }
    return player;
  }));
}

// All routes require authenticated coach
router.use(authMiddleware, requireRole('coach'));

// ============ CHAT HISTORY ENDPOINTS ============

// GET /api/ai/chats?type=recruit_assistant
router.get('/chats', async (req, res) => {
  try {
    const chatType = req.query.type || 'recruit_assistant';
    const chats = await AiChat.getChatsByCoach(req.userId, chatType);
    res.json({ chats });
  } catch (error) {
    console.error('Get AI chats error:', error);
    res.status(500).json({ error: 'Failed to fetch chats' });
  }
});

// POST /api/ai/chats
router.post('/chats', async (req, res) => {
  try {
    const { chat_type = 'recruit_assistant', title } = req.body;
    const chat = await AiChat.createChat(req.userId, chat_type, title);
    res.json({ chat });
  } catch (error) {
    console.error('Create AI chat error:', error);
    res.status(500).json({ error: 'Failed to create chat' });
  }
});

// GET /api/ai/chats/:chatId
router.get('/chats/:chatId', validateUUID('chatId'), async (req, res) => {
  try {
    const chat = await AiChat.getChatWithMessages(req.params.chatId, req.userId);
    if (!chat) {
      return res.status(404).json({ error: 'Chat not found' });
    }
    res.json({ chat });
  } catch (error) {
    console.error('Get AI chat error:', error);
    res.status(500).json({ error: 'Failed to fetch chat' });
  }
});

// PUT /api/ai/chats/:chatId/title
router.put('/chats/:chatId/title', validateUUID('chatId'), async (req, res) => {
  try {
    const { title } = req.body;
    const chat = await AiChat.updateTitle(req.params.chatId, req.userId, title);
    if (!chat) {
      return res.status(404).json({ error: 'Chat not found' });
    }
    res.json({ chat });
  } catch (error) {
    console.error('Update AI chat title error:', error);
    res.status(500).json({ error: 'Failed to update title' });
  }
});

// DELETE /api/ai/chats/:chatId
router.delete('/chats/:chatId', validateUUID('chatId'), async (req, res) => {
  try {
    const deleted = await AiChat.deleteChat(req.params.chatId, req.userId);
    if (!deleted) {
      return res.status(404).json({ error: 'Chat not found' });
    }
    res.json({ success: true });
  } catch (error) {
    console.error('Delete AI chat error:', error);
    res.status(500).json({ error: 'Failed to delete chat' });
  }
});

// ============ RE-SEARCH ENDPOINT (reload player cards for chat history) ============

// POST /api/ai/search
router.post('/search', async (req, res) => {
  try {
    const { filters } = req.body;
    if (!filters) {
      return res.status(400).json({ error: 'Filters are required' });
    }

    const result = await PlayerProfile.searchByAiFilters(
      filters,
      req.userId,
      5,
      0
    );

    result.players = await addSignedUrlsToProfiles(result.players);

    return res.json({
      players: result.players,
      hasMore: result.hasMore
    });
  } catch (error) {
    console.error('AI re-search error:', error);
    res.status(500).json({ error: 'Failed to search' });
  }
});

// ============ AI MESSAGE ENDPOINT ============

// POST /api/ai/chats/:chatId/message
router.post('/chats/:chatId/message', validateUUID('chatId'), async (req, res) => {
  try {
    const { message, baselines } = req.body;
    const chatId = req.params.chatId;

    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'Message is required' });
    }

    // 1. Verify chat ownership and get existing messages
    const chat = await AiChat.getChatWithMessages(chatId, req.userId);
    if (!chat) {
      return res.status(404).json({ error: 'Chat not found' });
    }

    // 2. Get coach profile info for context
    const coachProfile = await CoachProfile.findByUserId(req.userId);
    const coachState = coachProfile?.state || null;
    const coachDivision = coachProfile?.college_division || null;

    // 3. Save the user message
    await AiChat.addMessage(chatId, req.userId, 'user', message.trim());

    // 4. Update title from first message
    if (chat.messages.length === 0) {
      const title = message.trim().length > 50
        ? message.trim().substring(0, 50) + '...'
        : message.trim();
      await AiChat.updateTitle(chatId, req.userId, title);
    }

    // 5. Build conversation history for Claude (include player context from metadata)
    const conversationHistory = chat.messages.map(m => {
      let content = m.content;
      // For assistant messages that returned players, append player details as context
      if (m.role === 'assistant' && m.metadata && m.metadata.players && m.metadata.players.length > 0) {
        const playerSummaries = m.metadata.players.map(p => {
          const parts = [`${p.first_name} ${p.last_name}`];
          if (p.position) parts.push(`Position: ${p.position}`);
          if (p.height) parts.push(`Height: ${p.height}`);
          if (p.weight) parts.push(`Weight: ${p.weight} lbs`);
          if (p.gpa) parts.push(`GPA: ${p.gpa}`);
          if (p.state && p.transfer === 'y') {
            parts.push(`State (college location): ${p.state}`);
          } else if (p.state) {
            parts.push(`Home State: ${p.state}`);
          }
          if (p.team_name) parts.push(`School: ${p.team_name}`);
          if (p.college_division) parts.push(`Division: ${p.college_division}`);
          if (p.eligibility) parts.push(`Eligibility: ${p.eligibility} year(s)`);
          if (p.graduation_year) parts.push(`Class of ${p.graduation_year}`);
          if (p.username) parts.push(`Username: ${p.username}`);

          // Include stats if available
          if (p.stats && p.stats.length > 0) {
            const statsLines = p.stats.map(g => {
              const label = g.season_year === 0 ? 'Career Totals' : g.season_year === -1 ? 'Last Season' : `${g.season_year} Season`;
              const opponent = g.opponent ? ` vs ${g.opponent}` : '';
              const result = g.result ? ` (${g.result})` : '';
              const posStats = g.position_stats.map(ps => {
                const statEntries = Object.entries(ps.stats || {}).map(([k, v]) => `${k}: ${v}`).join(', ');
                return `${ps.position}: ${statEntries}`;
              }).join('; ');
              return `  ${label}${opponent}${result} — ${posStats}`;
            }).join('\n');
            parts.push(`\nStats:\n${statsLines}`);
          }

          return parts.join(', ');
        }).join('\n\n');
        content += `\n\n[Players shown to coach:\n${playerSummaries}]`;
      }
      return { role: m.role, content };
    });
    conversationHistory.push({ role: 'user', content: message.trim() });

    // 6. Call Claude Haiku to interpret the query
    const aiResponse = await getRecruitingFilters(
      conversationHistory,
      baselines || null,
      coachState,
      coachDivision
    );

    // 7. If it's a conversational response (no filters), return it
    if (!aiResponse.filters) {
      const responseText = aiResponse.message || "I'm not sure how to help with that. Try describing the type of player you're looking for!";

      await AiChat.addMessage(chatId, req.userId, 'assistant', responseText);

      return res.json({
        response: responseText,
        players: [],
        filters: null,
        summary: null
      });
    }

    // 8. Execute the search with AI-generated filters
    const result = await PlayerProfile.searchByAiFilters(
      aiResponse.filters,
      req.userId,
      5,
      0
    );

    // 9. Add signed URLs to player profile images
    result.players = await addSignedUrlsToProfiles(result.players);

    // 10. Build response text (clean, coach-facing — no internal reasoning)
    const playerCount = result.players.length;
    let responseText;
    if (playerCount === 0) {
      responseText = `No players found matching those criteria. Try broadening your search — widen the position, state, or size requirements.`;
    } else if (playerCount < 5 && !result.hasMore) {
      responseText = `Found ${playerCount} player${playerCount !== 1 ? 's' : ''} matching your criteria.`;
    } else {
      responseText = `Found ${playerCount}${result.hasMore ? '+' : ''} player${playerCount !== 1 ? 's' : ''} matching your criteria.`;
    }

    // 11. Save assistant response with metadata (include player summaries + stats for chat context)
    const playerSummaries = await Promise.all(result.players.map(async (p) => {
      const summary = {
        first_name: p.first_name,
        last_name: p.last_name,
        username: p.username,
        position: p.position,
        height: p.height,
        weight: p.weight,
        gpa: p.gpa,
        state: p.state,
        team_name: p.team_name,
        college_division: p.college_division,
        eligibility: p.eligibility,
        graduation_year: p.graduation_year,
        transfer: p.transfer
      };

      // Fetch game/career stats for this player
      try {
        const games = await PlayerGameStats.getByUserId(p.user_id);
        if (games && games.length > 0) {
          summary.stats = games.map(g => ({
            season_year: g.season_year,
            opponent: g.opponent,
            result: g.result,
            position_stats: g.position_stats
          }));
        }
      } catch (e) {
        // Stats fetch failed, continue without them
      }

      return summary;
    }));

    await AiChat.addMessage(chatId, req.userId, 'assistant', responseText, {
      filters: aiResponse.filters,
      players: playerSummaries,
      playerCount: playerCount,
      hasMore: result.hasMore
    });

    return res.json({
      response: responseText,
      players: result.players,
      filters: aiResponse.filters,
      summary: aiResponse.summary,
      hasMore: result.hasMore
    });

  } catch (error) {
    console.error('AI message error:', error);
    res.status(500).json({ error: 'Failed to process message' });
  }
});

module.exports = router;
