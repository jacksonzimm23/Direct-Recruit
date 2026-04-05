const express = require('express');
const router = express.Router();
const { authMiddleware, requireRole, validateUUID } = require('../middleware/auth');
const AiChat = require('../models/AiChat');
const PlayerProfile = require('../models/PlayerProfile');
const CoachProfile = require('../models/CoachProfile');
const { getRecruitingFilters } = require('../utils/ai');
const { getPortalIntelligence } = require('../utils/portal-intelligence');
const PortalSignal = require('../models/PortalSignal');
const PortalWatchlist = require('../models/PortalWatchlist');
const { getSignedS3Url } = require('../utils/s3');
const PlayerGameStats = require('../models/PlayerGameStats');
const logger = require('../utils/logger');

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
    logger.error('Get AI chats error:', error);
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
    logger.error('Create AI chat error:', error);
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

    // Sign profile image keys in metadata for PI/RA player cards
    if (chat.messages) {
      await Promise.all(chat.messages.map(async (msg) => {
        if (msg.metadata && msg.metadata.players) {
          await Promise.all(msg.metadata.players.map(async (player) => {
            if (player.profile_image_key) {
              player.profile_image_url = await getSignedS3Url(player.profile_image_key);
            }
          }));
        }
      }));
    }

    res.json({ chat });
  } catch (error) {
    logger.error('Get AI chat error:', error);
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
    logger.error('Update AI chat title error:', error);
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
    logger.error('Delete AI chat error:', error);
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
    logger.error('AI re-search error:', error);
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
        transfer: p.transfer,
        relevance_score: p.relevance_score || null
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
    logger.error('AI message error:', error);
    res.status(500).json({ error: 'Failed to process message' });
  }
});

// ============ PORTAL INTELLIGENCE MESSAGE ENDPOINT ============

// POST /api/ai/chats/:chatId/pi-message
// Send a message and get portal intelligence analysis + flagged players
router.post('/chats/:chatId/pi-message', validateUUID('chatId'), async (req, res) => {
  try {
    const { message } = req.body;
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

    // 5. Build conversation history (include flagged player context from metadata)
    const conversationHistory = chat.messages.map(m => {
      let content = m.content;
      if (m.role === 'assistant' && m.metadata && m.metadata.players && m.metadata.players.length > 0) {
        const playerSummaries = m.metadata.players.map(p => {
          const parts = [`${p.first_name} ${p.last_name}`];
          if (p.position) parts.push(`Position: ${p.position}`);
          if (p.team_name) parts.push(`School: ${p.team_name}`);
          if (p.college_division) parts.push(`Division: ${p.college_division}`);
          if (p.height) parts.push(`Height: ${p.height}`);
          if (p.weight) parts.push(`Weight: ${p.weight} lbs`);
          if (p.gpa) parts.push(`GPA: ${p.gpa}`);
          if (p.signal_types) parts.push(`Signals: ${p.signal_types.join(', ')}`);
          if (p.signal_details) {
            if (p.signal_details.portal_keywords) {
              if (p.signal_details.portal_keywords.matched_keywords) {
                parts.push(`Keywords found in bio: "${p.signal_details.portal_keywords.matched_keywords.join('", "')}"`);
              }
              if (p.signal_details.portal_keywords.bio_text) {
                parts.push(`Full bio: "${p.signal_details.portal_keywords.bio_text}"`);
              }
              if (p.signal_details.portal_keywords.bio_updated) {
                parts.push(`Bio last updated: ${new Date(p.signal_details.portal_keywords.bio_updated).toLocaleDateString()}`);
              }
            }
            if (p.signal_details.browsing_coaches) {
              if (p.signal_details.browsing_coaches.coaches_viewed) {
                const coachList = p.signal_details.browsing_coaches.coaches_viewed.map(c =>
                  `${c.name}${c.title ? ' (' + c.title + ')' : ''} at ${c.team} (${c.division}) — ${c.views} view${c.views > 1 ? 's' : ''}`
                ).join('; ');
                parts.push(`Coaches viewed: ${coachList}`);
              }
              if (p.signal_details.browsing_coaches.unique_teams_browsed) {
                parts.push(`Unique external teams browsed: ${p.signal_details.browsing_coaches.unique_teams_browsed}`);
              }
              parts.push(`Total external coach views: ${p.signal_details.browsing_coaches.total_external_views}`);
            }
            if (p.signal_details.bio_and_film) {
              if (p.signal_details.bio_and_film.bio_excerpt) {
                parts.push(`Bio excerpt: "${p.signal_details.bio_and_film.bio_excerpt}"`);
              }
              if (p.signal_details.bio_and_film.bio_updated) {
                parts.push(`Bio updated: ${new Date(p.signal_details.bio_and_film.bio_updated).toLocaleDateString()}`);
              }
              if (p.signal_details.bio_and_film.recent_highlights) {
                const hlList = p.signal_details.bio_and_film.recent_highlights.map(h =>
                  `"${h.title}" (${h.type}, uploaded ${new Date(h.uploaded_at).toLocaleDateString()})`
                ).join(', ');
                parts.push(`Recent highlights uploaded: ${hlList}`);
              }
            }
          }
          return parts.join(', ');
        }).join('\n\n');
        content += `\n\n[Flagged players shown:\n${playerSummaries}]`;
      }
      return { role: m.role, content };
    });
    conversationHistory.push({ role: 'user', content: message.trim() });

    // 6. Call Claude Haiku for portal intelligence
    const aiResponse = await getPortalIntelligence(
      conversationHistory,
      coachState,
      coachDivision
    );

    // 7. If it's a conversational response (no signal filters), return it
    if (!aiResponse.signal_filters) {
      const responseText = aiResponse.message || "I focus on detecting portal signals from player behavior. Try asking about which players are showing transfer activity.";

      await AiChat.addMessage(chatId, req.userId, 'assistant', responseText);

      return res.json({
        response: responseText,
        players: [],
        signal_filters: null,
        summary: null
      });
    }

    // 8. Execute the signal query with AI-generated filters
    const result = await PortalSignal.queryBySignalFilters(
      aiResponse.signal_filters,
      req.userId,
      5,
      0
    );

    // 9. Save S3 keys before signing (for metadata persistence)
    const playerImageKeys = {};
    result.players.forEach(p => {
      if (p.profile_image_url) playerImageKeys[p.user_id] = p.profile_image_url;
    });

    // 10. Add signed URLs to player profile images
    result.players = await addSignedUrlsToProfiles(result.players);

    // 11. Build response text
    const playerCount = result.players.length;
    let responseText;
    if (playerCount === 0) {
      responseText = `No players are currently showing portal signals matching those criteria. This could mean no college players on the platform are exhibiting the behavioral patterns we track, or you might want to try a wider search — broaden the position, division, or lookback window.`;
    } else {
      responseText = `Found ${playerCount}${result.hasMore ? '+' : ''} college player${playerCount !== 1 ? 's' : ''} showing portal activity signals.`;
    }

    // 12. Save assistant response with metadata (use S3 keys, not signed URLs)
    const playerSummaries = result.players.map(p => ({
      user_id: p.user_id,
      first_name: p.first_name,
      last_name: p.last_name,
      username: p.username,
      position: p.position,
      height: p.height,
      weight: p.weight,
      gpa: p.gpa,
      team_name: p.team_name,
      college_division: p.college_division,
      signal_types: p.signal_types,
      signal_details: p.signal_details,
      profile_image_key: playerImageKeys[p.user_id] || null
    }));

    await AiChat.addMessage(chatId, req.userId, 'assistant', responseText, {
      signal_filters: aiResponse.signal_filters,
      players: playerSummaries,
      playerCount: playerCount,
      hasMore: result.hasMore
    });

    return res.json({
      response: responseText,
      players: result.players,
      signal_filters: aiResponse.signal_filters,
      summary: aiResponse.summary,
      hasMore: result.hasMore
    });

  } catch (error) {
    logger.error('Portal Intelligence message error:', error);
    res.status(500).json({ error: 'Failed to process portal intelligence message' });
  }
});

// ========================
// PORTAL WATCHLIST ROUTES
// ========================

// Get watchlist with player data
router.get('/watchlist', async (req, res) => {
  try {
    let players = await PortalWatchlist.getWatchlist(req.userId);
    players = await addSignedUrlsToProfiles(players);
    const count = players.length;
    res.json({ players, count, max: 50 });
  } catch (error) {
    logger.error('Get watchlist error:', error);
    res.status(500).json({ error: 'Failed to get watchlist' });
  }
});

// Batch check which players are watched
router.get('/watchlist/check', async (req, res) => {
  try {
    const playerIds = req.query.playerIds ? req.query.playerIds.split(',').filter(id => id) : [];
    if (playerIds.length === 0) {
      return res.json({ watchedIds: [] });
    }
    const watchedIds = await PortalWatchlist.checkPlayers(req.userId, playerIds);
    res.json({ watchedIds });
  } catch (error) {
    logger.error('Check watchlist error:', error);
    res.status(500).json({ error: 'Failed to check watchlist' });
  }
});

// Add player to watchlist
router.post('/watchlist/:playerUserId', async (req, res) => {
  try {
    const { playerUserId } = req.params;
    const result = await PortalWatchlist.addPlayer(req.userId, playerUserId);
    if (!result.success) {
      return res.status(400).json({ error: result.error, count: result.count });
    }
    res.json({ success: true, count: result.count });
  } catch (error) {
    logger.error('Add to watchlist error:', error);
    res.status(500).json({ error: 'Failed to add to watchlist' });
  }
});

// Remove player from watchlist
router.delete('/watchlist/:playerUserId', async (req, res) => {
  try {
    const { playerUserId } = req.params;
    const result = await PortalWatchlist.removePlayer(req.userId, playerUserId);
    res.json({ success: true, count: result.count });
  } catch (error) {
    logger.error('Remove from watchlist error:', error);
    res.status(500).json({ error: 'Failed to remove from watchlist' });
  }
});

// Remove all players from watchlist
router.delete('/watchlist', async (req, res) => {
  try {
    await PortalWatchlist.removeAll(req.userId);
    res.json({ success: true, count: 0 });
  } catch (error) {
    logger.error('Clear watchlist error:', error);
    res.status(500).json({ error: 'Failed to clear watchlist' });
  }
});

module.exports = router;
