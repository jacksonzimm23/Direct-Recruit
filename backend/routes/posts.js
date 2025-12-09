const express = require('express');
const router = express.Router();
const Post = require('../models/Post');
const { authMiddleware } = require('../middleware/auth');
const { body, validationResult } = require('express-validator');
const { postLimiter } = require('../middleware/rateLimit');

// ==================== FEED ENDPOINTS ====================
// IMPORTANT: These must come BEFORE /:postId routes to avoid conflict

// Get combined feed (Option 4: Following posts first, then Discover)
router.get('/feed/combined', authMiddleware, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const offset = parseInt(req.query.offset) || 0;

    const posts = await Post.getCombinedFeed(req.userId, limit, offset);
    res.json({ posts, count: posts.length });
  } catch (error) {
    console.error('Get combined feed error:', error);
    res.status(500).json({ error: 'Failed to fetch feed' });
  }
});

// Get following feed only (Your Network)
router.get('/feed/following', authMiddleware, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const offset = parseInt(req.query.offset) || 0;

    const posts = await Post.getFollowingFeed(req.userId, limit, offset);
    res.json({ posts, count: posts.length });
  } catch (error) {
    console.error('Get following feed error:', error);
    res.status(500).json({ error: 'Failed to fetch following feed' });
  }
});

// Get discover feed only
router.get('/feed/discover', authMiddleware, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const offset = parseInt(req.query.offset) || 0;

    const posts = await Post.getDiscoverFeed(req.userId, limit, offset);
    res.json({ posts, count: posts.length });
  } catch (error) {
    console.error('Get discover feed error:', error);
    res.status(500).json({ error: 'Failed to fetch discover feed' });
  }
});

// Legacy feed endpoint (backwards compatible - returns combined feed)
router.get('/feed', authMiddleware, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const offset = parseInt(req.query.offset) || 0;

    const posts = await Post.getCombinedFeed(req.userId, limit, offset);
    res.json({ posts, count: posts.length });
  } catch (error) {
    console.error('Get feed error:', error);
    res.status(500).json({ error: 'Failed to fetch feed' });
  }
});

// Get user's posts
router.get('/user/:userId', authMiddleware, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const offset = parseInt(req.query.offset) || 0;

    const posts = await Post.getUserPosts(req.params.userId, req.userId, limit, offset);
    res.json({ posts, count: posts.length });
  } catch (error) {
    console.error('Get user posts error:', error);
    res.status(500).json({ error: 'Failed to fetch posts' });
  }
});

// Get saved posts
router.get('/saved/list', authMiddleware, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const offset = parseInt(req.query.offset) || 0;

    const posts = await Post.getSavedPosts(req.userId, limit, offset);
    res.json({ posts, count: posts.length });
  } catch (error) {
    console.error('Get saved posts error:', error);
    res.status(500).json({ error: 'Failed to fetch saved posts' });
  }
});

// Get user's reposts (for showing at top of feed)
router.get('/reposts/mine', authMiddleware, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const offset = parseInt(req.query.offset) || 0;

    const posts = await Post.getUserReposts(req.userId, limit, offset);
    res.json({ posts, count: posts.length });
  } catch (error) {
    console.error('Get reposts error:', error);
    res.status(500).json({ error: 'Failed to fetch reposts' });
  }
});

// ==================== COMMENT ROUTES (non-post-specific) ====================

// Get comment replies
router.get('/comments/:commentId/replies', authMiddleware, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const offset = parseInt(req.query.offset) || 0;

    const replies = await Post.getCommentReplies(req.params.commentId, limit, offset);
    res.json({ replies, count: replies.length });
  } catch (error) {
    console.error('Get replies error:', error);
    res.status(500).json({ error: 'Failed to fetch replies' });
  }
});

// Like comment
router.post('/comments/:commentId/like', authMiddleware, async (req, res) => {
  try {
    const result = await Post.likeComment(req.params.commentId, req.userId);
    res.json({ message: 'Comment liked', liked: !!result });
  } catch (error) {
    console.error('Like comment error:', error);
    res.status(500).json({ error: 'Failed to like comment' });
  }
});

// Unlike comment
router.delete('/comments/:commentId/like', authMiddleware, async (req, res) => {
  try {
    const result = await Post.unlikeComment(req.params.commentId, req.userId);
    if (!result) {
      return res.status(400).json({ error: 'Comment not liked' });
    }
    res.json({ message: 'Comment unliked' });
  } catch (error) {
    console.error('Unlike comment error:', error);
    res.status(500).json({ error: 'Failed to unlike comment' });
  }
});

// ==================== SHARE ROUTES (non-post-specific) ====================

// Unshare post
router.delete('/shares/:shareId', authMiddleware, async (req, res) => {
  try {
    const result = await Post.unsharePost(req.params.shareId, req.userId);
    if (!result) {
      return res.status(404).json({ error: 'Share not found or unauthorized' });
    }
    res.json({ message: 'Share removed' });
  } catch (error) {
    console.error('Unshare post error:', error);
    res.status(500).json({ error: 'Failed to remove share' });
  }
});

// ==================== POST CRUD ====================

// Create post
router.post('/', authMiddleware, postLimiter, [
  body('content').trim().notEmpty().withMessage('Content required'),
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
    console.error('Create post error:', error);
    res.status(500).json({ error: 'Failed to create post' });
  }
});

// Get specific post
router.get('/:postId', authMiddleware, async (req, res) => {
  try {
    const post = await Post.getById(req.params.postId, req.userId);
    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }
    res.json({ post });
  } catch (error) {
    console.error('Get post error:', error);
    res.status(500).json({ error: 'Failed to fetch post' });
  }
});

// Update post
router.put('/:postId', authMiddleware, async (req, res) => {
  try {
    const post = await Post.update(req.params.postId, req.userId, req.body);
    if (!post) {
      return res.status(404).json({ error: 'Post not found or unauthorized' });
    }
    res.json({ message: 'Post updated', post });
  } catch (error) {
    console.error('Update post error:', error);
    res.status(500).json({ error: 'Failed to update post' });
  }
});

// Delete post
router.delete('/:postId', authMiddleware, async (req, res) => {
  try {
    const post = await Post.delete(req.params.postId, req.userId);
    if (!post) {
      return res.status(404).json({ error: 'Post not found or unauthorized' });
    }
    res.json({ message: 'Post deleted' });
  } catch (error) {
    console.error('Delete post error:', error);
    res.status(500).json({ error: 'Failed to delete post' });
  }
});

// ==================== LIKES ====================

// Like post
router.post('/:postId/like', authMiddleware, async (req, res) => {
  try {
    const result = await Post.like(req.params.postId, req.userId);
    res.json({ message: 'Post liked', liked: !!result });
  } catch (error) {
    console.error('Like post error:', error);
    res.status(500).json({ error: 'Failed to like post' });
  }
});

// Unlike post
router.delete('/:postId/like', authMiddleware, async (req, res) => {
  try {
    const result = await Post.unlike(req.params.postId, req.userId);
    if (!result) {
      return res.status(400).json({ error: 'Post not liked' });
    }
    res.json({ message: 'Post unliked' });
  } catch (error) {
    console.error('Unlike post error:', error);
    res.status(500).json({ error: 'Failed to unlike post' });
  }
});

// Get post likes
router.get('/:postId/likes', authMiddleware, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;

    const likes = await Post.getLikes(req.params.postId, limit, offset);
    res.json({ likes, count: likes.length });
  } catch (error) {
    console.error('Get likes error:', error);
    res.status(500).json({ error: 'Failed to fetch likes' });
  }
});

// Get post shares (reposts and quotes)
router.get('/:postId/shares', authMiddleware, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;

    const shares = await Post.getShares(req.params.postId, limit, offset);
    res.json(shares);
  } catch (error) {
    console.error('Get shares error:', error);
    res.status(500).json({ error: 'Failed to fetch shares' });
  }
});

// ==================== COMMENTS ====================

// Add comment
router.post('/:postId/comments', authMiddleware, [
  body('content').trim().notEmpty().withMessage('Comment content required'),
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
    res.status(201).json({ message: 'Comment added', comment });
  } catch (error) {
    console.error('Add comment error:', error);
    res.status(500).json({ error: 'Failed to add comment' });
  }
});

// Get comments
router.get('/:postId/comments', authMiddleware, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;

    const comments = await Post.getComments(req.params.postId, req.userId, limit, offset);
    res.json({ comments, count: comments.length });
  } catch (error) {
    console.error('Get comments error:', error);
    res.status(500).json({ error: 'Failed to fetch comments' });
  }
});

// Delete comment
router.delete('/:postId/comments/:commentId', authMiddleware, async (req, res) => {
  try {
    const result = await Post.deleteComment(req.params.commentId, req.userId, req.params.postId);
    if (!result) {
      return res.status(404).json({ error: 'Comment not found or unauthorized' });
    }
    res.json({ message: 'Comment deleted' });
  } catch (error) {
    console.error('Delete comment error:', error);
    res.status(500).json({ error: 'Failed to delete comment' });
  }
});

// ==================== SAVES (BOOKMARKS) ====================

// Save post
router.post('/:postId/save', authMiddleware, async (req, res) => {
  try {
    const result = await Post.savePost(req.params.postId, req.userId);
    res.json({ message: 'Post saved', saved: !!result });
  } catch (error) {
    console.error('Save post error:', error);
    res.status(500).json({ error: 'Failed to save post' });
  }
});

// Unsave post
router.delete('/:postId/save', authMiddleware, async (req, res) => {
  try {
    const result = await Post.unsavePost(req.params.postId, req.userId);
    if (!result) {
      return res.status(400).json({ error: 'Post not saved' });
    }
    res.json({ message: 'Post unsaved' });
  } catch (error) {
    console.error('Unsave post error:', error);
    res.status(500).json({ error: 'Failed to unsave post' });
  }
});

// ==================== SHARES ====================

// Share post (repost)
router.post('/:postId/share', authMiddleware, [
  body('share_type').optional().isIn(['repost', 'quote']),
  body('quote_content').optional().trim()
], async (req, res) => {
  try {
    const { share_type = 'repost', quote_content } = req.body;
    const result = await Post.sharePost(req.params.postId, req.userId, share_type, quote_content);

    // If already reposted, return info for toggle
    if (result.already_reposted) {
      return res.status(200).json({
        message: 'Already reposted',
        already_reposted: true,
        share_id: result.share_id
      });
    }

    res.status(201).json({ message: 'Post shared', share: result });
  } catch (error) {
    console.error('Share post error:', error);
    res.status(500).json({ error: 'Failed to share post' });
  }
});

// Unrepost post (by post ID, for toggle)
router.delete('/:postId/repost', authMiddleware, async (req, res) => {
  try {
    const result = await Post.unrepostByPostId(req.params.postId, req.userId);
    if (!result) {
      return res.status(404).json({ error: 'Repost not found' });
    }
    res.json({ message: 'Repost removed' });
  } catch (error) {
    console.error('Unrepost error:', error);
    res.status(500).json({ error: 'Failed to remove repost' });
  }
});

// ==================== PIN POST ====================

// Pin post
router.post('/:postId/pin', authMiddleware, async (req, res) => {
  try {
    const result = await Post.pinPost(req.params.postId, req.userId);
    if (!result) {
      return res.status(404).json({ error: 'Post not found or unauthorized' });
    }
    res.json({ message: 'Post pinned', post: result });
  } catch (error) {
    console.error('Pin post error:', error);
    res.status(500).json({ error: 'Failed to pin post' });
  }
});

// Unpin post
router.delete('/:postId/pin', authMiddleware, async (req, res) => {
  try {
    const result = await Post.unpinPost(req.params.postId, req.userId);
    if (!result) {
      return res.status(404).json({ error: 'Post not found or unauthorized' });
    }
    res.json({ message: 'Post unpinned', post: result });
  } catch (error) {
    console.error('Unpin post error:', error);
    res.status(500).json({ error: 'Failed to unpin post' });
  }
});

module.exports = router;
