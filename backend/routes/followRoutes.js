const express = require('express');

const followController = require('../controllers/followController');
const { protect } = require('../middleware/auth');

const router = express.Router();

router.post('/:userId', protect, followController.followUser);
router.delete('/:userId', protect, followController.unfollowUser);
router.get('/:userId/followers', protect, followController.getFollowers);
router.get('/:userId/following', protect, followController.getFollowing);

module.exports = router;
