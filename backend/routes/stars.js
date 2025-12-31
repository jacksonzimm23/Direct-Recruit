const express = require('express');
const router = express.Router();
const https = require('https');
const http = require('http');
const PlayerProfile = require('../models/PlayerProfile');
const { authMiddleware, requireRole } = require('../middleware/auth');

/**
 * Fetch URL content with proper headers
 */
function fetchUrl(url) {
    return new Promise((resolve, reject) => {
        const protocol = url.startsWith('https') ? https : http;

        const options = {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
                'Connection': 'keep-alive',
            }
        };

        const request = protocol.get(url, options, (response) => {
            // Handle redirects
            if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                fetchUrl(response.headers.location).then(resolve).catch(reject);
                return;
            }

            if (response.statusCode !== 200) {
                reject(new Error(`HTTP ${response.statusCode}: Failed to fetch URL`));
                return;
            }

            let data = '';
            response.on('data', (chunk) => {
                data += chunk;
            });
            response.on('end', () => {
                resolve(data);
            });
        });

        request.on('error', (error) => {
            reject(error);
        });

        request.setTimeout(15000, () => {
            request.destroy();
            reject(new Error('Request timed out'));
        });
    });
}

/**
 * Extract star rating from 247 Sports
 */
function extract247SportsStars(html) {
    // Look for the stars-block section
    const starsBlockMatch = html.match(/<div[^>]*class="[^"]*stars-block[^"]*"[^>]*>([\s\S]*?)<\/div>/i);

    if (starsBlockMatch) {
        const starsBlockContent = starsBlockMatch[1];
        const yellowStars = (starsBlockContent.match(/icon-starsolid[^"]*yellow/gi) || []).length;
        const greyStars = (starsBlockContent.match(/icon-starsolid[^"]*lightgrey/gi) || []).length;

        if (yellowStars > 0 || greyStars > 0) {
            return yellowStars;
        }
    }

    // Alternative pattern
    const starRatingMatch = html.match(/(\d)\s*-?\s*star/i);
    if (starRatingMatch) {
        return parseInt(starRatingMatch[1]);
    }

    return null;
}

/**
 * Extract star rating from On3 / Rivals
 */
function extractOn3RivalsStars(html) {
    // Look for aria-label with star rating
    const ariaLabelMatch = html.match(/aria-label="(\d)\s*Stars?"/i);
    if (ariaLabelMatch) {
        return parseInt(ariaLabelMatch[1]);
    }

    // Look for StarRating class sections
    const starRatingMatch = html.match(/StarRating[^"]*"[^>]*>[\s\S]*?(\d)\s*Stars?/i);
    if (starRatingMatch) {
        return parseInt(starRatingMatch[1]);
    }

    // Look for star rating text pattern
    const textMatch = html.match(/>(\d)\s*Stars?</i);
    if (textMatch) {
        return parseInt(textMatch[1]);
    }

    // Look for transfer portal specific patterns
    // Pattern: "2-Star" or "2 Star" followed by text
    const transferStarMatch = html.match(/(\d)-?\s*Star(?:s)?\s+(?:Rating|Player|Prospect|Transfer)/i);
    if (transferStarMatch) {
        return parseInt(transferStarMatch[1]);
    }

    // Pattern: class containing star info like "star-2" or "stars-2"
    const classStarMatch = html.match(/class="[^"]*stars?-(\d)[^"]*"/i);
    if (classStarMatch) {
        return parseInt(classStarMatch[1]);
    }

    // Pattern: Look for rating followed by stars icon (common in transfer portal pages)
    const ratingIconMatch = html.match(/"rating"[^>]*>(\d)</i);
    if (ratingIconMatch) {
        return parseInt(ratingIconMatch[1]);
    }

    return null;
}

/**
 * Validate URL format for the given source
 */
function validateUrl(source, url) {
    if (source === '247sports') {
        if (!url.includes('247sports.com')) {
            return { valid: false, error: 'URL must be from 247sports.com' };
        }
        if (!url.includes('/player/')) {
            return { valid: false, error: 'URL must be a player profile (should contain /player/)' };
        }
    } else if (source === 'on3') {
        if (!url.includes('on3.com')) {
            return { valid: false, error: 'URL must be from on3.com' };
        }
        // Support various On3 URL patterns: /rivals/, /db/, /transfer-portal/, /college/
        if (!url.includes('/rivals/') && !url.includes('/db/') && !url.includes('/transfer-portal/') && !url.includes('/college/')) {
            return { valid: false, error: 'URL must be a player profile (should contain /rivals/, /db/, /transfer-portal/, or /college/)' };
        }
    } else {
        return { valid: false, error: 'Invalid source. Use "247sports" or "on3"' };
    }
    return { valid: true };
}

/**
 * POST /api/stars/verify
 * Verify star rating from external recruiting service
 */
router.post('/verify', authMiddleware, requireRole('player'), async (req, res) => {
    try {
        const { source, url } = req.body;

        if (!source || !url) {
            return res.status(400).json({ error: 'Source and URL are required' });
        }

        // Validate URL
        const validation = validateUrl(source, url);
        if (!validation.valid) {
            return res.status(400).json({ error: validation.error });
        }

        // Fetch the page
        let html;
        try {
            html = await fetchUrl(url);
        } catch (fetchError) {
            return res.status(400).json({ error: 'Failed to fetch the profile page. Please check the URL.' });
        }

        // Extract stars based on source
        let stars;
        if (source === '247sports') {
            stars = extract247SportsStars(html);
        } else {
            stars = extractOn3RivalsStars(html);
        }

        // Return the result
        res.json({
            success: true,
            stars: stars !== null ? stars : 0,
            source: source,
            url: url,
            verified: stars !== null && stars >= 1 && stars <= 5
        });

    } catch (error) {
        console.error('Star verification error:', error);
        res.status(500).json({ error: 'An error occurred during verification' });
    }
});

/**
 * POST /api/stars/save
 * Save verified star rating to player profile (0-5 stars allowed)
 */
router.post('/save', authMiddleware, requireRole('player'), async (req, res) => {
    try {
        const { stars, source, url } = req.body;

        if (stars === undefined || stars === null || !source || !url) {
            return res.status(400).json({ error: 'Stars, source, and URL are required' });
        }

        if (stars < 0 || stars > 5) {
            return res.status(400).json({ error: 'Stars must be between 0 and 5' });
        }

        // Update the player profile with star rating
        const profile = await PlayerProfile.findByUserId(req.userId);
        if (!profile) {
            return res.status(404).json({ error: 'Player profile not found' });
        }

        // Update profile with star rating info
        const updatedProfile = await PlayerProfile.update(req.userId, {
            star_rating: stars,
            star_source: source,
            star_verification_url: url,
            star_verified_at: new Date()
        });

        res.json({
            success: true,
            message: stars === 0 ? 'Profile verified (no stars yet)' : 'Star rating saved successfully',
            profile: updatedProfile
        });

    } catch (error) {
        console.error('Save star rating error:', error);
        res.status(500).json({ error: 'An error occurred while saving the star rating' });
    }
});

/**
 * GET /api/stars/my-rating
 * Get current user's star rating
 */
router.get('/my-rating', authMiddleware, requireRole('player'), async (req, res) => {
    try {
        const profile = await PlayerProfile.findByUserId(req.userId);
        if (!profile) {
            return res.status(404).json({ error: 'Player profile not found' });
        }

        // Return star_rating as-is (including 0), only null if never verified
        res.json({
            stars: profile.star_rating !== undefined ? profile.star_rating : null,
            source: profile.star_source || null,
            url: profile.star_verification_url || null,
            verifiedAt: profile.star_verified_at || null
        });

    } catch (error) {
        console.error('Get star rating error:', error);
        res.status(500).json({ error: 'An error occurred while fetching the star rating' });
    }
});

/**
 * DELETE /api/stars/clear
 * Clear star rating from player profile
 */
router.delete('/clear', authMiddleware, requireRole('player'), async (req, res) => {
    try {
        const profile = await PlayerProfile.findByUserId(req.userId);
        if (!profile) {
            return res.status(404).json({ error: 'Player profile not found' });
        }

        // Clear star rating fields
        const updatedProfile = await PlayerProfile.update(req.userId, {
            star_rating: null,
            star_source: null,
            star_verification_url: null,
            star_verified_at: null
        });

        res.json({
            success: true,
            message: 'Star rating cleared successfully',
            profile: updatedProfile
        });

    } catch (error) {
        console.error('Clear star rating error:', error);
        res.status(500).json({ error: 'An error occurred while clearing the star rating' });
    }
});

module.exports = router;
