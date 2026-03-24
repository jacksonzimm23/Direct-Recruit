const express = require('express');
const router = express.Router();
const Post = require('../models/Post');
const Notification = require('../models/Notification');
const PlayerProfile = require('../models/PlayerProfile');
const CoachProfile = require('../models/CoachProfile');
const OtherProfile = require('../models/OtherProfile');
const User = require('../models/User');
const Follow = require('../models/Follow');
const pool = require('../config/database');
const { authMiddleware, validateUUID } = require('../middleware/auth');
const { body, validationResult } = require('express-validator');
const { postLimiter } = require('../middleware/rateLimit');
const { sanitizeBody } = require('../middleware/validation');
const { getSignedS3Url } = require('../utils/s3');
const logger = require('../utils/logger');

// Helper function to check if viewer can access a user's content
async function canAccessUserContent(viewerId, targetUserId) {
  // Owner can always access their own content
  if (viewerId === targetUserId) {
    return true;
  }

  // Check if profile is private
  const isPrivate = await Follow.isPrivateProfile(targetUserId);
  if (!isPrivate) {
    return true;
  }

  // Check if viewer follows the private profile
  return await Follow.isFollowing(viewerId, targetUserId);
}

// Helper function to add signed URLs to posts array
async function addSignedUrlsToPosts(posts) {
  if (!posts || !Array.isArray(posts)) return posts;

  return await Promise.all(posts.map(async (post) => {
    // Handle author_image
    if (post.author_image && post.author_image.startsWith('profiles/')) {
      try {
        post.author_image = await getSignedS3Url(post.author_image);
      } catch (error) {
        logger.error('Error generating signed URL for author_image:', error);
        post.author_image = null;
      }
    }
    // Handle quoter_image for reposts/quotes
    if (post.quoter_image && post.quoter_image.startsWith('profiles/')) {
      try {
        post.quoter_image = await getSignedS3Url(post.quoter_image);
      } catch (error) {
        logger.error('Error generating signed URL for quoter_image:', error);
        post.quoter_image = null;
      }
    }
    // Handle original_author_image for reposts/quotes on profile page
    if (post.original_author_image && post.original_author_image.startsWith('profiles/')) {
      try {
        post.original_author_image = await getSignedS3Url(post.original_author_image);
      } catch (error) {
        logger.error('Error generating signed URL for original_author_image:', error);
        post.original_author_image = null;
      }
    }
    // Handle reposter_image for reposts/quotes in feed
    if (post.reposter_image && post.reposter_image.startsWith('profiles/')) {
      try {
        post.reposter_image = await getSignedS3Url(post.reposter_image);
      } catch (error) {
        logger.error('Error generating signed URL for reposter_image:', error);
        post.reposter_image = null;
      }
    }
    // Handle media_urls array (post-media S3 keys)
    if (post.media_urls && Array.isArray(post.media_urls) && post.media_urls.length > 0) {
      try {
        // Keep original S3 keys for editing
        post.media_urls_keys = [...post.media_urls];
        post.signed_media_urls = await Promise.all(
          post.media_urls.map(async (url) => {
            // Only generate signed URL for S3 keys (not already signed URLs or external URLs)
            if (url && url.startsWith('post-media/')) {
              return await getSignedS3Url(url);
            }
            return url;
          })
        );
        // Also update media_urls to signed for backwards compatibility
        post.media_urls = post.signed_media_urls;
      } catch (error) {
        logger.error('Error generating signed URLs for media_urls:', error);
      }
    }
    // Handle original_media_urls for reposts/quotes
    if (post.original_media_urls && Array.isArray(post.original_media_urls) && post.original_media_urls.length > 0) {
      try {
        post.original_media_urls = await Promise.all(
          post.original_media_urls.map(async (url) => {
            if (url && url.startsWith('post-media/')) {
              return await getSignedS3Url(url);
            }
            return url;
          })
        );
      } catch (error) {
        logger.error('Error generating signed URLs for original_media_urls:', error);
      }
    }
    // Handle quote_media_urls for quote posts with their own media
    if (post.quote_media_urls && Array.isArray(post.quote_media_urls) && post.quote_media_urls.length > 0) {
      try {
        // Keep original S3 keys for editing
        post.quote_media_urls_keys = [...post.quote_media_urls];
        post.signed_quote_media_urls = await Promise.all(
          post.quote_media_urls.map(async (url) => {
            if (url && url.startsWith('post-media/')) {
              return await getSignedS3Url(url);
            }
            return url;
          })
        );
        // Also update quote_media_urls to signed for backwards compatibility
        post.quote_media_urls = post.signed_quote_media_urls;
      } catch (error) {
        logger.error('Error generating signed URLs for quote_media_urls:', error);
      }
    }
    return post;
  }));
}

// Helper function to add signed URLs to likes/shares arrays
async function addSignedUrlsToUsers(users) {
  if (!users || !Array.isArray(users)) return users;

  return await Promise.all(users.map(async (user) => {
    if (user.profile_image_url && user.profile_image_url.startsWith('profiles/')) {
      try {
        user.profile_image_url = await getSignedS3Url(user.profile_image_url);
      } catch (error) {
        logger.error('Error generating signed URL for profile_image_url:', error);
        user.profile_image_url = null;
      }
    }
    return user;
  }));
}

// Helper function to get user name
async function getUserName(userId) {
  const user = await User.findById(userId);
  if (!user) return 'Someone';

  if (user.role === 'player') {
    const profile = await PlayerProfile.findByUserId(userId);
    return profile ? `${profile.first_name} ${profile.last_name}` : 'Someone';
  } else if (user.role === 'coach') {
    const profile = await CoachProfile.findByUserId(userId);
    return profile ? `${profile.first_name} ${profile.last_name}` : 'Someone';
  } else if (user.role === 'other') {
    const profile = await OtherProfile.findByUserId(userId);
    return profile ? `${profile.first_name} ${profile.last_name}` : 'Someone';
  }
  return 'Someone';
}

// ==================== FEED ENDPOINTS ====================
// IMPORTANT: These must come BEFORE /:postId routes to avoid conflict

// Get combined feed (Option 4: Following posts first, then Discover)
router.get('/feed/combined', authMiddleware, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const offset = parseInt(req.query.offset) || 0;

    let posts = await Post.getCombinedFeed(req.userId, limit, offset);
    posts = await addSignedUrlsToPosts(posts);
    res.json({ posts, count: posts.length });
  } catch (error) {
    logger.error('Get combined feed error:', error);
    res.status(500).json({ error: 'Failed to fetch feed' });
  }
});

// Get following feed only (Your Network)
router.get('/feed/following', authMiddleware, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const offset = parseInt(req.query.offset) || 0;

    let posts = await Post.getFollowingFeed(req.userId, limit, offset);
    posts = await addSignedUrlsToPosts(posts);
    res.json({ posts, count: posts.length });
  } catch (error) {
    logger.error('Get following feed error:', error);
    res.status(500).json({ error: 'Failed to fetch following feed' });
  }
});

// Get discover feed only
router.get('/feed/discover', authMiddleware, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const offset = parseInt(req.query.offset) || 0;

    let posts = await Post.getDiscoverFeed(req.userId, limit, offset);
    posts = await addSignedUrlsToPosts(posts);
    res.json({ posts, count: posts.length });
  } catch (error) {
    logger.error('Get discover feed error:', error);
    res.status(500).json({ error: 'Failed to fetch discover feed' });
  }
});

// Check for new posts since a given timestamp (for "New posts available" button)
router.get('/feed/new-posts-count', authMiddleware, async (req, res) => {
  try {
    const { since, feedType = 'discover' } = req.query;

    if (!since) {
      return res.status(400).json({ error: 'Missing "since" timestamp parameter' });
    }

    const sinceDate = new Date(since);
    if (isNaN(sinceDate.getTime())) {
      return res.status(400).json({ error: 'Invalid "since" timestamp' });
    }

    const count = await Post.getNewPostsCount(req.userId, sinceDate, feedType);
    res.json({ newPostsCount: count });
  } catch (error) {
    logger.error('Get new posts count error:', error);
    res.status(500).json({ error: 'Failed to check for new posts' });
  }
});

// Legacy feed endpoint (backwards compatible - returns combined feed)
router.get('/feed', authMiddleware, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const offset = parseInt(req.query.offset) || 0;

    let posts = await Post.getCombinedFeed(req.userId, limit, offset);
    posts = await addSignedUrlsToPosts(posts);
    res.json({ posts, count: posts.length });
  } catch (error) {
    logger.error('Get feed error:', error);
    res.status(500).json({ error: 'Failed to fetch feed' });
  }
});

// Get user's posts (includes original posts, reposts, and quote posts)
router.get('/user/:userId', authMiddleware, validateUUID('userId'), async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const offset = parseInt(req.query.offset) || 0;

    // Check if viewer can access this user's content (private profile check)
    const canAccess = await canAccessUserContent(req.userId, req.params.userId);
    if (!canAccess) {
      return res.json({ posts: [], count: 0, accessDenied: true });
    }

    // Use combined method that includes reposts and quote posts
    let posts = await Post.getUserPostsWithReposts(req.params.userId, req.userId, limit, offset);
    posts = await addSignedUrlsToPosts(posts);
    res.json({ posts, count: posts.length });
  } catch (error) {
    logger.error('Get user posts error:', error);
    res.status(500).json({ error: 'Failed to fetch posts' });
  }
});

// Get user's replies/comments (for profile Replies tab)
router.get('/user/:userId/replies', authMiddleware, validateUUID('userId'), async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const offset = parseInt(req.query.offset) || 0;

    // Check if viewer can access this user's content (private profile check)
    const canAccess = await canAccessUserContent(req.userId, req.params.userId);
    if (!canAccess) {
      return res.json({ replies: [], count: 0, accessDenied: true });
    }

    let replies = await Post.getUserReplies(req.params.userId, req.userId, limit, offset);
    replies = await addSignedUrlsToPosts(replies);
    res.json({ replies, count: replies.length });
  } catch (error) {
    logger.error('Get user replies error:', error);
    res.status(500).json({ error: 'Failed to fetch replies' });
  }
});

// Get user's liked posts (for profile Likes tab)
router.get('/user/:userId/likes', authMiddleware, validateUUID('userId'), async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const offset = parseInt(req.query.offset) || 0;

    // Check if viewer can access this user's content (private profile check)
    const canAccess = await canAccessUserContent(req.userId, req.params.userId);
    if (!canAccess) {
      return res.json({ posts: [], count: 0, accessDenied: true });
    }

    let posts = await Post.getLikedPosts(req.params.userId, req.userId, limit, offset);
    posts = await addSignedUrlsToPosts(posts);
    res.json({ posts, count: posts.length });
  } catch (error) {
    logger.error('Get liked posts error:', error);
    res.status(500).json({ error: 'Failed to fetch liked posts' });
  }
});

// Get saved posts
router.get('/saved/list', authMiddleware, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const offset = parseInt(req.query.offset) || 0;

    let posts = await Post.getSavedPosts(req.userId, limit, offset);
    posts = await addSignedUrlsToPosts(posts);
    res.json({ posts, count: posts.length });
  } catch (error) {
    logger.error('Get saved posts error:', error);
    res.status(500).json({ error: 'Failed to fetch saved posts' });
  }
});

// Get user's reposts (for showing at top of feed)
router.get('/reposts/mine', authMiddleware, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const offset = parseInt(req.query.offset) || 0;

    let posts = await Post.getUserReposts(req.userId, limit, offset);
    posts = await addSignedUrlsToPosts(posts);
    res.json({ posts, count: posts.length });
  } catch (error) {
    logger.error('Get reposts error:', error);
    res.status(500).json({ error: 'Failed to fetch reposts' });
  }
});

// ==================== COMMENT ROUTES (non-post-specific) ====================

// Get comment replies
router.get('/comments/:commentId/replies', authMiddleware, validateUUID('commentId'), async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const offset = parseInt(req.query.offset) || 0;

    let replies = await Post.getCommentReplies(req.params.commentId, limit, offset);
    replies = await addSignedUrlsToPosts(replies); // Comments have author_image field
    res.json({ replies, count: replies.length });
  } catch (error) {
    logger.error('Get replies error:', error);
    res.status(500).json({ error: 'Failed to fetch replies' });
  }
});

// Like comment
router.post('/comments/:commentId/like', authMiddleware, validateUUID('commentId'), async (req, res) => {
  try {
    const result = await Post.likeComment(req.params.commentId, req.userId);

    // Create notification for the comment owner
    if (result) {
      try {
        // Get the comment to find its owner and associated post
        const commentResult = await pool.query(
          'SELECT user_id, post_id FROM comments WHERE id = $1',
          [req.params.commentId]
        );
        if (commentResult.rows.length > 0) {
          const comment = commentResult.rows[0];
          if (comment.user_id !== req.userId) {
            const likerName = await getUserName(req.userId);
            await Notification.createCommentLikeNotification(
              comment.user_id,
              req.userId,
              likerName,
              req.params.commentId,
              comment.post_id
            );
          }
        }
      } catch (notifError) {
        logger.error('Failed to create comment like notification:', notifError);
      }
    }

    res.json({ message: 'Comment liked', liked: !!result });
  } catch (error) {
    logger.error('Like comment error:', error);
    res.status(500).json({ error: 'Failed to like comment' });
  }
});

// Unlike comment
router.delete('/comments/:commentId/like', authMiddleware, validateUUID('commentId'), async (req, res) => {
  try {
    const result = await Post.unlikeComment(req.params.commentId, req.userId);
    if (!result) {
      return res.status(400).json({ error: 'Comment not liked' });
    }
    res.json({ message: 'Comment unliked' });
  } catch (error) {
    logger.error('Unlike comment error:', error);
    res.status(500).json({ error: 'Failed to unlike comment' });
  }
});

// ==================== SHARE ROUTES (non-post-specific) ====================

// Unshare post
router.delete('/shares/:shareId', authMiddleware, validateUUID('shareId'), async (req, res) => {
  try {
    const result = await Post.unsharePost(req.params.shareId, req.userId);
    if (!result) {
      return res.status(404).json({ error: 'Share not found or unauthorized' });
    }
    res.json({ message: 'Share removed' });
  } catch (error) {
    logger.error('Unshare post error:', error);
    res.status(500).json({ error: 'Failed to remove share' });
  }
});

// ==================== POST CRUD ====================

// Create post
router.post('/', authMiddleware, postLimiter, sanitizeBody, [
  body('content').trim().notEmpty().withMessage('Content required').isLength({ max: 5000 }).withMessage('Post content must be 5000 characters or less'),
  body('media_urls').optional().isArray(),
  body('media_type').optional().isIn(['image', 'video', 'mixed']),
  body('visibility').optional().isIn(['public', 'followers_only', 'private'])
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const post = await Post.create(req.userId, req.body);
    res.status(201).json({ message: 'Post created', post });
  } catch (error) {
    logger.error('Create post error:', error);
    res.status(500).json({ error: 'Failed to create post' });
  }
});

// Get specific share (repost or quote) by share ID
// NOTE: This route MUST come before /:postId to avoid "share" being matched as a postId
router.get('/share/:shareId', authMiddleware, validateUUID('shareId'), async (req, res) => {
  try {
    let share = await Post.getShareById(req.params.shareId, req.userId);
    if (!share) {
      return res.status(404).json({ error: 'Share not found' });
    }
    // Generate signed URLs for media
    const sharesWithSignedUrls = await addSignedUrlsToPosts([share]);
    share = sharesWithSignedUrls[0];
    res.json({ share });
  } catch (error) {
    logger.error('Get share error:', error);
    res.status(500).json({ error: 'Failed to fetch share' });
  }
});

// Update quote content for a share
router.put('/share/:shareId', authMiddleware, validateUUID('shareId'), [
  body('quote_content').trim()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const { quote_content, media_urls, media_type } = req.body;
    const result = await Post.updateShareQuote(req.params.shareId, req.userId, quote_content, media_urls, media_type);
    if (!result) {
      return res.status(404).json({ error: 'Share not found or not authorized' });
    }
    res.json({ message: 'Quote updated', share: result });
  } catch (error) {
    logger.error('Update share quote error:', error);
    res.status(500).json({ error: 'Failed to update quote' });
  }
});

// Get specific post
router.get('/:postId', authMiddleware, validateUUID('postId'), async (req, res) => {
  try {
    let post = await Post.getById(req.params.postId, req.userId);
    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }
    // Generate signed URLs for post (wrap in array for helper function)
    const postsWithSignedUrls = await addSignedUrlsToPosts([post]);
    post = postsWithSignedUrls[0];
    res.json({ post });
  } catch (error) {
    logger.error('Get post error:', error);
    res.status(500).json({ error: 'Failed to fetch post' });
  }
});

// Update post
router.put('/:postId', authMiddleware, validateUUID('postId'), async (req, res) => {
  try {
    const post = await Post.update(req.params.postId, req.userId, req.body);
    if (!post) {
      return res.status(404).json({ error: 'Post not found or unauthorized' });
    }
    res.json({ message: 'Post updated', post });
  } catch (error) {
    logger.error('Update post error:', error);
    res.status(500).json({ error: 'Failed to update post' });
  }
});

// Delete post
router.delete('/:postId', authMiddleware, validateUUID('postId'), async (req, res) => {
  try {
    const post = await Post.delete(req.params.postId, req.userId);
    if (!post) {
      return res.status(404).json({ error: 'Post not found or unauthorized' });
    }
    res.json({ message: 'Post deleted' });
  } catch (error) {
    logger.error('Delete post error:', error);
    res.status(500).json({ error: 'Failed to delete post' });
  }
});

// ==================== LIKES ====================

// Like post
router.post('/:postId/like', authMiddleware, validateUUID('postId'), async (req, res) => {
  try {
    const result = await Post.like(req.params.postId, req.userId);

    // Create notification for the post owner
    if (result) {
      try {
        const post = await Post.getById(req.params.postId, req.userId);
        if (post && post.user_id !== req.userId) {
          const likerName = await getUserName(req.userId);
          await Notification.createLikeNotification(post.user_id, req.userId, likerName, req.params.postId);
        }
      } catch (notifError) {
        logger.error('Failed to create like notification:', notifError);
      }
    }

    res.json({ message: 'Post liked', liked: !!result });
  } catch (error) {
    logger.error('Like post error:', error);
    res.status(500).json({ error: 'Failed to like post' });
  }
});

// Unlike post
router.delete('/:postId/like', authMiddleware, validateUUID('postId'), async (req, res) => {
  try {
    const result = await Post.unlike(req.params.postId, req.userId);
    if (!result) {
      return res.status(400).json({ error: 'Post not liked' });
    }
    res.json({ message: 'Post unliked' });
  } catch (error) {
    logger.error('Unlike post error:', error);
    res.status(500).json({ error: 'Failed to unlike post' });
  }
});

// Get post likes
router.get('/:postId/likes', authMiddleware, validateUUID('postId'), async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;

    let likes = await Post.getLikes(req.params.postId, limit, offset);
    likes = await addSignedUrlsToUsers(likes);
    res.json({ likes, count: likes.length });
  } catch (error) {
    logger.error('Get likes error:', error);
    res.status(500).json({ error: 'Failed to fetch likes' });
  }
});

// Get post shares (reposts and quotes)
router.get('/:postId/shares', authMiddleware, validateUUID('postId'), async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;

    const shares = await Post.getShares(req.params.postId, limit, offset);
    // Add signed URLs to all share arrays
    shares.all = await addSignedUrlsToUsers(shares.all);
    shares.reposts = await addSignedUrlsToUsers(shares.reposts);
    shares.quotes = await addSignedUrlsToUsers(shares.quotes);
    res.json(shares);
  } catch (error) {
    logger.error('Get shares error:', error);
    res.status(500).json({ error: 'Failed to fetch shares' });
  }
});

// ==================== COMMENTS ====================

// Add comment
router.post('/:postId/comments', authMiddleware, validateUUID('postId'), sanitizeBody, [
  body('content').trim().notEmpty().withMessage('Comment content required').isLength({ max: 2000 }).withMessage('Comment must be 2000 characters or less'),
  body('parent_comment_id').optional().isUUID()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const comment = await Post.addComment(
      req.params.postId,
      req.userId,
      req.body.content,
      req.body.parent_comment_id || null
    );

    // Create notification for the post owner (for top-level comments)
    try {
      const post = await Post.getById(req.params.postId, req.userId);
      if (post && post.user_id !== req.userId) {
        const commenterName = await getUserName(req.userId);
        await Notification.createCommentNotification(post.user_id, req.userId, commenterName, req.params.postId, req.body.content);
      }
    } catch (notifError) {
      logger.error('Failed to create comment notification:', notifError);
    }

    // Create notification for the parent comment owner (for replies)
    if (req.body.parent_comment_id) {
      try {
        const parentCommentResult = await pool.query(
          'SELECT user_id FROM comments WHERE id = $1',
          [req.body.parent_comment_id]
        );
        if (parentCommentResult.rows.length > 0) {
          const parentCommentOwnerId = parentCommentResult.rows[0].user_id;
          if (parentCommentOwnerId !== req.userId) {
            const replierName = await getUserName(req.userId);
            await Notification.createCommentReplyNotification(
              parentCommentOwnerId,
              req.userId,
              replierName,
              req.params.postId,
              req.body.content
            );
          }
        }
      } catch (notifError) {
        logger.error('Failed to create comment reply notification:', notifError);
      }
    }

    res.status(201).json({ message: 'Comment added', comment });
  } catch (error) {
    logger.error('Add comment error:', error);
    res.status(500).json({ error: 'Failed to add comment' });
  }
});

// Get comments
router.get('/:postId/comments', authMiddleware, validateUUID('postId'), async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;

    let comments = await Post.getComments(req.params.postId, req.userId, limit, offset);
    comments = await addSignedUrlsToPosts(comments); // Comments have author_image field
    res.json({ comments, count: comments.length });
  } catch (error) {
    logger.error('Get comments error:', error);
    res.status(500).json({ error: 'Failed to fetch comments' });
  }
});

// Delete comment
router.delete('/:postId/comments/:commentId', authMiddleware, validateUUID('postId', 'commentId'), async (req, res) => {
  try {
    const result = await Post.deleteComment(req.params.commentId, req.userId, req.params.postId);
    if (!result) {
      return res.status(404).json({ error: 'Comment not found or unauthorized' });
    }
    res.json({ message: 'Comment deleted' });
  } catch (error) {
    logger.error('Delete comment error:', error);
    res.status(500).json({ error: 'Failed to delete comment' });
  }
});

// Edit comment
router.put('/:postId/comments/:commentId', authMiddleware, validateUUID('postId', 'commentId'), async (req, res) => {
  try {
    const { content } = req.body;
    if (!content || !content.trim()) {
      return res.status(400).json({ error: 'Comment content is required' });
    }
    const result = await Post.updateComment(req.params.commentId, req.userId, content.trim());
    if (!result) {
      return res.status(404).json({ error: 'Comment not found or unauthorized' });
    }
    res.json({ message: 'Comment updated', comment: result });
  } catch (error) {
    logger.error('Update comment error:', error);
    res.status(500).json({ error: 'Failed to update comment' });
  }
});

// ==================== SAVES (BOOKMARKS) ====================

// Save post
router.post('/:postId/save', authMiddleware, validateUUID('postId'), async (req, res) => {
  try {
    const result = await Post.savePost(req.params.postId, req.userId);
    res.json({ message: 'Post saved', saved: !!result });
  } catch (error) {
    logger.error('Save post error:', error);
    res.status(500).json({ error: 'Failed to save post' });
  }
});

// Unsave post
router.delete('/:postId/save', authMiddleware, validateUUID('postId'), async (req, res) => {
  try {
    const result = await Post.unsavePost(req.params.postId, req.userId);
    if (!result) {
      return res.status(400).json({ error: 'Post not saved' });
    }
    res.json({ message: 'Post unsaved' });
  } catch (error) {
    logger.error('Unsave post error:', error);
    res.status(500).json({ error: 'Failed to unsave post' });
  }
});

// ==================== SHARES ====================

// Share post (repost)
router.post('/:postId/share', authMiddleware, validateUUID('postId'), [
  body('share_type').optional().isIn(['repost', 'quote']),
  body('quote_content').optional().trim(),
  body('media_urls').optional().isArray(),
  body('media_type').optional().isIn(['image', 'video', 'mixed'])
], async (req, res) => {
  try {
    const { share_type = 'repost', quote_content, media_urls, media_type } = req.body;
    const result = await Post.sharePost(req.params.postId, req.userId, share_type, quote_content, media_urls, media_type);

    // If already reposted, return info for toggle
    if (result.already_reposted) {
      return res.status(200).json({
        message: 'Already reposted',
        already_reposted: true,
        share_id: result.share_id
      });
    }

    // Create notification for the post owner
    try {
      const post = await Post.getById(req.params.postId, req.userId);
      if (post && post.user_id !== req.userId) {
        const sharerName = await getUserName(req.userId);
        await Notification.createShareNotification(
          post.user_id,
          req.userId,
          sharerName,
          req.params.postId,
          share_type
        );
      }
    } catch (notifError) {
      logger.error('Failed to create share notification:', notifError);
    }

    res.status(201).json({ message: 'Post shared', share: result });
  } catch (error) {
    logger.error('Share post error:', error);
    res.status(500).json({ error: 'Failed to share post' });
  }
});

// Unrepost post (by post ID, for toggle)
router.delete('/:postId/repost', authMiddleware, validateUUID('postId'), async (req, res) => {
  try {
    const result = await Post.unrepostByPostId(req.params.postId, req.userId);
    if (!result) {
      return res.status(404).json({ error: 'Repost not found' });
    }
    res.json({ message: 'Repost removed' });
  } catch (error) {
    logger.error('Unrepost error:', error);
    res.status(500).json({ error: 'Failed to remove repost' });
  }
});

// ==================== PIN POST ====================

// Pin post
router.post('/:postId/pin', authMiddleware, validateUUID('postId'), async (req, res) => {
  try {
    const result = await Post.pinPost(req.params.postId, req.userId);
    if (!result) {
      return res.status(404).json({ error: 'Post not found or unauthorized' });
    }
    res.json({ message: 'Post pinned', post: result });
  } catch (error) {
    logger.error('Pin post error:', error);
    res.status(500).json({ error: 'Failed to pin post' });
  }
});

// Unpin post
router.delete('/:postId/pin', authMiddleware, validateUUID('postId'), async (req, res) => {
  try {
    const result = await Post.unpinPost(req.params.postId, req.userId);
    if (!result) {
      return res.status(404).json({ error: 'Post not found or unauthorized' });
    }
    res.json({ message: 'Post unpinned', post: result });
  } catch (error) {
    logger.error('Unpin post error:', error);
    res.status(500).json({ error: 'Failed to unpin post' });
  }
});

// ==================== SHARE ENGAGEMENT (for quote posts) ====================

// Like a share (quote post)
router.post('/share/:shareId/like', authMiddleware, validateUUID('shareId'), async (req, res) => {
  try {
    const result = await Post.likeShare(req.params.shareId, req.userId);

    // Create notification for the share owner
    if (result) {
      try {
        const share = await Post.getShareById(req.params.shareId, req.userId);
        if (share && share.quoter_user_id !== req.userId) {
          const likerName = await getUserName(req.userId);
          // Create notification for the quoter (share owner)
          await Notification.createShareLikeNotification(share.quoter_user_id, req.userId, likerName, req.params.shareId);
        }
      } catch (notifError) {
        logger.error('Failed to create share like notification:', notifError);
      }
    }

    res.json({ message: 'Share liked', liked: !!result });
  } catch (error) {
    logger.error('Like share error:', error);
    res.status(500).json({ error: 'Failed to like share' });
  }
});

// Unlike a share (quote post)
router.delete('/share/:shareId/like', authMiddleware, validateUUID('shareId'), async (req, res) => {
  try {
    const result = await Post.unlikeShare(req.params.shareId, req.userId);
    if (!result) {
      return res.status(400).json({ error: 'Share not liked' });
    }
    res.json({ message: 'Share unliked' });
  } catch (error) {
    logger.error('Unlike share error:', error);
    res.status(500).json({ error: 'Failed to unlike share' });
  }
});

// Get share likes
router.get('/share/:shareId/likes', authMiddleware, validateUUID('shareId'), async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;

    let likes = await Post.getShareLikes(req.params.shareId, limit, offset);
    likes = await addSignedUrlsToUsers(likes);
    res.json({ likes, count: likes.length });
  } catch (error) {
    logger.error('Get share likes error:', error);
    res.status(500).json({ error: 'Failed to fetch share likes' });
  }
});

// Save a share (quote post)
router.post('/share/:shareId/save', authMiddleware, validateUUID('shareId'), async (req, res) => {
  try {
    const result = await Post.saveShare(req.params.shareId, req.userId);
    res.json({ message: 'Share saved', saved: !!result });
  } catch (error) {
    logger.error('Save share error:', error);
    res.status(500).json({ error: 'Failed to save share' });
  }
});

// Unsave a share (quote post)
router.delete('/share/:shareId/save', authMiddleware, validateUUID('shareId'), async (req, res) => {
  try {
    const result = await Post.unsaveShare(req.params.shareId, req.userId);
    if (!result) {
      return res.status(400).json({ error: 'Share not saved' });
    }
    res.json({ message: 'Share unsaved' });
  } catch (error) {
    logger.error('Unsave share error:', error);
    res.status(500).json({ error: 'Failed to unsave share' });
  }
});

// Add comment to a share (quote post)
router.post('/share/:shareId/comments', authMiddleware, validateUUID('shareId'), sanitizeBody, [
  body('content').trim().notEmpty().withMessage('Comment content is required').isLength({ max: 2000 }).withMessage('Comment must be 2000 characters or less')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const { content, parent_comment_id } = req.body;
    const comment = await Post.addShareComment(req.params.shareId, req.userId, content, parent_comment_id);

    // Create notification for the share owner
    try {
      const share = await Post.getShareById(req.params.shareId, req.userId);
      if (share && share.quoter_user_id !== req.userId) {
        const commenterName = await getUserName(req.userId);
        await Notification.createShareCommentNotification(share.quoter_user_id, req.userId, commenterName, req.params.shareId);
      }
    } catch (notifError) {
      logger.error('Failed to create share comment notification:', notifError);
    }

    res.status(201).json({ comment });
  } catch (error) {
    logger.error('Add share comment error:', error);
    res.status(500).json({ error: 'Failed to add comment' });
  }
});

// Get comments for a share (quote post)
router.get('/share/:shareId/comments', authMiddleware, validateUUID('shareId'), async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;

    let comments = await Post.getShareComments(req.params.shareId, limit, offset);
    comments = await addSignedUrlsToUsers(comments);
    res.json({ comments });
  } catch (error) {
    logger.error('Get share comments error:', error);
    res.status(500).json({ error: 'Failed to fetch comments' });
  }
});

// Delete a share comment
router.delete('/share/comments/:commentId', authMiddleware, validateUUID('commentId'), async (req, res) => {
  try {
    const result = await Post.deleteShareComment(req.params.commentId, req.userId);
    if (!result) {
      return res.status(404).json({ error: 'Comment not found or unauthorized' });
    }
    res.json({ message: 'Comment deleted' });
  } catch (error) {
    logger.error('Delete share comment error:', error);
    res.status(500).json({ error: 'Failed to delete comment' });
  }
});

// Like a share comment
router.post('/share/comments/:commentId/like', authMiddleware, validateUUID('commentId'), async (req, res) => {
  try {
    const result = await Post.likeShareComment(req.params.commentId, req.userId);
    res.json({ message: 'Comment liked', liked: !!result });
  } catch (error) {
    logger.error('Like share comment error:', error);
    res.status(500).json({ error: 'Failed to like comment' });
  }
});

// Unlike a share comment
router.delete('/share/comments/:commentId/like', authMiddleware, validateUUID('commentId'), async (req, res) => {
  try {
    const result = await Post.unlikeShareComment(req.params.commentId, req.userId);
    if (!result) {
      return res.status(400).json({ error: 'Comment not liked' });
    }
    res.json({ message: 'Comment unliked' });
  } catch (error) {
    logger.error('Unlike share comment error:', error);
    res.status(500).json({ error: 'Failed to unlike comment' });
  }
});

module.exports = router;
