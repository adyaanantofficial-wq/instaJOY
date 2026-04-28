const express = require('express');

const postController = require('../controllers/postController');
const { optionalAuth, protect } = require('../middleware/auth');
const { createContentLimiter } = require('../middleware/rateLimiters');

const router = express.Router();

router.post('/', protect, createContentLimiter, postController.createPost);
router.get('/feed', optionalAuth, postController.getFeed);
router.get('/user/:username', optionalAuth, postController.getUserPosts);
router.get('/:postId', optionalAuth, postController.getPostById);
router.get('/:postId/comments', protect, postController.getComments);
router.post('/:postId/like', protect, postController.likePost);
router.delete('/:postId/like', protect, postController.unlikePost);
router.post('/:postId/comments', protect, createContentLimiter, postController.commentOnPost);
router.delete('/:postId', protect, postController.deletePost);

module.exports = router;
