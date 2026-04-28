/**
 * Post Routes
 */

const express = require('express');
const { protect } = require('../middleware/auth');
const postController = require('../controllers/postController');

const router = express.Router();

/**
 * POST /api/posts/create
 * Create new post
 */
router.post('/create', protect, postController.createPost);

/**
 * GET /api/posts/feed
 * Get feed posts
 */
router.get('/feed', postController.getFeed);

/**
 * GET /api/posts/user/:userId
 * Get user's posts
 */
router.get('/user/:userId', postController.getUserPosts);

/**
 * POST /api/posts/:postId/like
 * Like a post
 */
router.post('/:postId/like', protect, postController.likePost);

/**
 * POST /api/posts/:postId/unlike
 * Unlike a post
 */
router.post('/:postId/unlike', protect, postController.unlikePost);

/**
 * POST /api/posts/:postId/comment
 * Comment on a post
 */
router.post('/:postId/comment', protect, postController.commentOnPost);

/**
 * DELETE /api/posts/:postId
 * Delete a post
 */
router.delete('/:postId', protect, postController.deletePost);

module.exports = router;
