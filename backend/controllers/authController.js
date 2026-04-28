/**
 * Authentication Controller
 */

const User = require('../models/User');
const jwt = require('jsonwebtoken');
const { validationResult } = require('express-validator');

/**
 * Generate JWT token
 */
const generateToken = (userId) => {
    return jwt.sign({ userId, id: userId }, process.env.JWT_SECRET, {
        expiresIn: process.env.JWT_EXPIRES_IN || '1h',
    });
};

/**
 * Generate refresh token
 */
const generateRefreshToken = (userId) => {
    return jwt.sign({ userId, id: userId }, process.env.JWT_REFRESH_SECRET, {
        expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
    });
};

/**
 * Register new user
 * POST /api/auth/register
 */
exports.register = async (req, res, next) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                message: errors.array()[0].msg,
            });
        }

        const { username, email, password } = req.body;

        // Check if user already exists
        let user = await User.findOne({
            $or: [{ email }, { username }],
        });

        if (user) {
            return res.status(400).json({
                success: false,
                message: 'User already exists',
            });
        }

        // Create new user
        user = new User({
            username,
            email,
            password,
        });

        await user.save();

        // Generate tokens
        const token = generateToken(user._id);
        const refreshToken = generateRefreshToken(user._id);

        res.status(201).json({
            success: true,
            message: 'User registered successfully',
            user: {
                id: user._id,
                username: user.username,
                email: user.email,
            },
            token,
            refreshToken,
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Login user
 * POST /api/auth/login
 */
exports.login = async (req, res, next) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                message: errors.array()[0].msg,
            });
        }

        const { email, password } = req.body;

        // Find user and get password
        const user = await User.findOne({ email }).select('+password');

        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'Invalid credentials',
            });
        }

        // Check password
        const isMatch = await user.comparePassword(password);

        if (!isMatch) {
            return res.status(401).json({
                success: false,
                message: 'Invalid credentials',
            });
        }

        // Generate tokens
        const token = generateToken(user._id);
        const refreshToken = generateRefreshToken(user._id);

        res.status(200).json({
            success: true,
            message: 'Login successful',
            user: {
                id: user._id,
                username: user.username,
                email: user.email,
            },
            token,
            refreshToken,
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Refresh token
 * POST /api/auth/refresh
 */
exports.refreshToken = async (req, res, next) => {
    try {
        const { refreshToken } = req.body;

        if (!refreshToken) {
            return res.status(400).json({
                success: false,
                message: 'Refresh token required',
            });
        }

        try {
            const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
            const token = generateToken(decoded.userId);

            res.status(200).json({
                success: true,
                token,
            });
        } catch (error) {
            return res.status(401).json({
                success: false,
                message: 'Invalid refresh token',
            });
        }
    } catch (error) {
        next(error);
    }
};

/**
 * Get current user
 * GET /api/auth/me
 */
exports.getMe = async (req, res, next) => {
    try {
        const user = await User.findById(req.user.userId);

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found',
            });
        }

        res.status(200).json({
            success: true,
            user,
        });
    } catch (error) {
        next(error);
    }
};
