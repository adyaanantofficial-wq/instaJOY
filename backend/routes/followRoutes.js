/**
 * Follow Routes
 */

const express = require('express');
const { protect } = require('../middleware/auth');
const followController = require('../controllers/followController');

const router = express.Router();

router.post('/:userId', protect, followController.followUser);
router.post('/:userId/unfollow', protect, followController.unfollowUser);
router.get('/:userId/followers', followController.getFollowers);
router.get('/:userId/following', followController.getFollowing);

module.exports = router;
