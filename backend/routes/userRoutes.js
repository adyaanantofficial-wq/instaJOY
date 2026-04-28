const express = require('express');
const { body } = require('express-validator');

const userController = require('../controllers/userController');
const { optionalAuth, protect } = require('../middleware/auth');

const router = express.Router();

router.get('/me/profile', protect, userController.getCurrentProfile);
router.get('/:username', optionalAuth, userController.getUserByUsername);
router.patch(
    '/me/profile',
    protect,
    [
        body('bio')
            .optional({ nullable: true })
            .isString()
            .isLength({ max: 160 })
            .withMessage('Bio must be 160 characters or fewer'),
        body('profileImage')
            .optional()
            .isString()
            .withMessage('Profile image must be a base64 data URI'),
        body('removeProfileImage')
            .optional()
            .isBoolean()
            .withMessage('removeProfileImage must be a boolean'),
    ],
    userController.updateProfile
);

module.exports = router;
