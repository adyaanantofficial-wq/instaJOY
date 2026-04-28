/**
 * User Routes
 */

const express = require('express');
const { body } = require('express-validator');
const userController = require('../controllers/userController');
const { protect } = require('../middleware/auth');

const router = express.Router();

/**
 * Get user by username
 * GET /api/user/:username
 */
router.get('/:username', userController.getUserByUsername);

/**
 * Update profile
 * POST /api/user/profile/update
 */
router.post(
    '/profile/update',
    protect,
    [body('bio').optional().trim().isLength({ max: 150 }).withMessage('Bio must be 150 characters or less')],
    userController.updateProfile
);

/**
 * Follow user
 * POST /api/user/follow
 */
router.post('/follow', protect, [body('userId').notEmpty().withMessage('User ID required')], userController.followUser);

/**
 * Unfollow user
 * POST /api/user/unfollow
 */
router.post('/unfollow', protect, [body('userId').notEmpty().withMessage('User ID required')], userController.unfollowUser);

/**
 * Get suggested users
 * GET /api/user/suggested
 */
router.get('/suggested', protect, userController.getSuggestedUsers);

module.exports = router;
