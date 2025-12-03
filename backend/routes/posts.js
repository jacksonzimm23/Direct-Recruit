const express = require('express');
const router = express.Router();
const Post = require('../models/Post');
const { authMiddleware } = require('../middleware/auth');
const { body, validationResult } = require('express-validator');
const { postLimiter } = require('../middleware/rateLimit');

// Create post
router.post('/', authMiddleware, postLimiter, [
  body('content').trim().notEmpty().withMessage('Content required'),
  body('media_url').optional().isURL(),
  body('media_type').optional().isIn(['image', 'video'])
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

// Get user's feed
router.get('/feed', authMiddleware, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const offset = parseInt(req.query.offset) || 0;

    const posts = await Post.getFeed(req.userId, limit, offset);
    res.json({ posts, count: posts.length });
  } catch (error) {
    console.error('Get feed error:', error);
    res.status(500).json({ error: 'Failed to fetch feed' });
  }
});

// Get specific post
router.get('/:postId', authMiddleware, async (req, res) => {
  try {
    const post = await Post.getById(req.params.postId);
    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }
    res.json({ post });
  } catch (error) {
    console.error('Get post error:', error);
    res.status(500).json({ error: 'Failed to fetch post' });
  }
});

// Get user's posts
router.get('/user/:userId', authMiddleware, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const offset = parseInt(req.query.offset) || 0;

    const posts = await Post.getUserPosts(req.params.userId, limit, offset);
    res.json({ posts, count: posts.length });
  } catch (error) {
    console.error('Get user posts error:', error);
    res.status(500).json({ error: 'Failed to fetch posts' });
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

// Like post
router.post('/:postId/like', authMiddleware, async (req, res) => {
  console.log('=== LIKE ROUTE HIT ===');
  console.log('postId from params:', req.params.postId);
  console.log('userId from auth:', req.userId);
  try {
    const result = await Post.like(req.params.postId, req.userId);
    console.log('Like result:', result);
    res.json({ message: 'Post liked' });
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

// Add comment
router.post('/:postId/comments', authMiddleware, [
  body('content').trim().notEmpty().withMessage('Comment content required')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const comment = await Post.addComment(req.params.postId, req.userId, req.body.content);
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

    const comments = await Post.getComments(req.params.postId, limit, offset);
    res.json({ comments, count: comments.length });
  } catch (error) {
    console.error('Get comments error:', error);
    res.status(500).json({ error: 'Failed to fetch comments' });
  }
});

module.exports = router;
