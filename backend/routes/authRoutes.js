const express = require('express');
const { body } = require('express-validator');

const authController = require('../controllers/authController');
const { protect } = require('../middleware/auth');

const router = express.Router();

router.post(
    '/register',
    [
        body('username')
            .trim()
            .toLowerCase()
            .matches(/^[a-z0-9_.]+$/)
            .withMessage('Username may only include letters, numbers, dots, and underscores')
            .isLength({ min: 3, max: 30 })
            .withMessage('Username must be between 3 and 30 characters'),
        body('email').isEmail().withMessage('A valid email is required'),
        body('password')
            .isLength({ min: 6, max: 128 })
            .withMessage('Password must be between 6 and 128 characters'),
    ],
    authController.register
);

router.post(
    '/login',
    [
        body('email').isEmail().withMessage('A valid email is required'),
        body('password').isString().notEmpty().withMessage('Password is required'),
    ],
    authController.login
);

router.post('/refresh', authController.refreshToken);
router.get('/me', protect, authController.getCurrentUser);
router.post('/logout', protect, authController.logout);

module.exports = router;
