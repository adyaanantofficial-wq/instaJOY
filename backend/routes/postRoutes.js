/**
 * Post Routes
 */

const express = require('express');
const { body } = require('express-validator');
const postController = require('../controllers/postController');
const { protect } = require('../middleware/auth');

const router = express.Router();

/**
 * Create post
 * POST /api/posts/create
 */
router.post(
    '/create',
    protect,
    [
        body('caption').optional().trim().isLength({ max: 2200 }).withMessage('Caption too long'),
        body('image').optional().isString().withMessage('Image must be base64 string'),
    ],
    postController.createPost
);

/**
 * Get feed
 * GET /api/posts/feed?page=1&limit=10
 */
router.get('/feed', protect, postController.getFeed);

/**
 * Get posts by user
 * GET /api/posts/user/:username
 */
router.get('/user/:username', postController.getPostsByUser);

/**
 * Delete post
 * DELETE /api/posts/:postId
 */
router.delete('/:postId', protect, postController.deletePost);

/**
 * Like post
 * POST /api/posts/:postId/like
 */
router.post('/:postId/like', protect, postController.likePost);

/**
 * Unlike post
 * POST /api/posts/:postId/unlike
 */
router.post('/:postId/unlike', protect, postController.unlikePost);

/**
 * Get comments
 * GET /api/posts/:postId/comments
 */
router.get('/:postId/comments', postController.getComments);

/**
 * Add comment
 * POST /api/posts/:postId/comment
 */
router.post('/:postId/comment', protect, [body('text').trim().notEmpty().withMessage('Comment cannot be empty')], postController.addComment);

/**
 * Delete comment
 * DELETE /api/posts/:postId/comment/:commentId
 */
router.delete('/:postId/comment/:commentId', protect, postController.deleteComment);

module.exports = router;
