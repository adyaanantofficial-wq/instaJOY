/**
 * Auth Routes
 */

const express = require('express');
const { body } = require('express-validator');
const authController = require('../controllers/authController');
const { protect } = require('../middleware/auth');

const router = express.Router();

/**
 * Register
 * POST /api/auth/register
 */
router.post(
    '/register',
    [
        body('username')
            .trim()
            .toLowerCase()
            .matches(/^[a-z0-9_.]+$/)
            .withMessage('Username can only contain letters, numbers, dots, and underscores')
            .isLength({ min: 3, max: 30 })
            .withMessage('Username must be 3-30 characters'),
        body('email').isEmail().withMessage('Please provide valid email'),
        body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    ],
    authController.register
);

/**
 * Login
 * POST /api/auth/login
 */
router.post(
    '/login',
    [
        body('email').isEmail().withMessage('Please provide valid email'),
        body('password').exists().withMessage('Password required'),
    ],
    authController.login
);

/**
 * Refresh Token
 * POST /api/auth/refresh
 */
router.post('/refresh', authController.refreshToken);

/**
 * Get current user
 * GET /api/auth/me
 */
router.get('/me', protect, authController.getMe);

module.exports = router;
