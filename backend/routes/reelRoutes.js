/**
 * Reel Routes
 */

const express = require('express');
const { protect } = require('../middleware/auth');
const reelController = require('../controllers/reelController');

const router = express.Router();

router.post('/create', protect, reelController.createReel);
router.get('/feed', reelController.getReelsFeed);
router.post('/:reelId/like', protect, reelController.likeReel);
router.post('/:reelId/comment', protect, reelController.commentReel);

module.exports = router;
