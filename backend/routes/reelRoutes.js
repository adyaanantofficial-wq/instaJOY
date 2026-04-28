const express = require('express');

const reelController = require('../controllers/reelController');
const { optionalAuth, protect } = require('../middleware/auth');
const { createContentLimiter } = require('../middleware/rateLimiters');

const router = express.Router();

router.post('/', protect, createContentLimiter, reelController.createReel);
router.get('/feed', optionalAuth, reelController.getReelsFeed);
router.get('/:reelId/comments', protect, reelController.getComments);
router.post('/:reelId/like', protect, reelController.likeReel);
router.delete('/:reelId/like', protect, reelController.unlikeReel);
router.post('/:reelId/comments', protect, createContentLimiter, reelController.commentReel);
router.delete('/:reelId', protect, reelController.deleteReel);

module.exports = router;
