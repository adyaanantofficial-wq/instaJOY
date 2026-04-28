const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const { getCollection } = require('../utils/database');
const asyncHandler = require('../utils/asyncHandler');
const { serializeUserSummary } = require('../utils/serializers');
const { normalizeEmail, normalizeUsername, toObjectId } = require('../utils/text');
const { ensureValidRequest } = require('../utils/validation');

function signAccessToken(userId) {
    return jwt.sign({ userId }, process.env.JWT_SECRET, {
        expiresIn: process.env.JWT_EXPIRES_IN || '2h',
    });
}

function signRefreshToken(userId) {
    return jwt.sign({ userId }, process.env.JWT_REFRESH_SECRET, {
        expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
    });
}

function serializeAuthUser(user) {
    return {
        ...serializeUserSummary(user),
        email: user.email,
    };
}

exports.register = asyncHandler(async (req, res) => {
    ensureValidRequest(req);

    const usersCollection = getCollection('users');
    const username = normalizeUsername(req.body.username);
    const email = normalizeEmail(req.body.email);
    const password = String(req.body.password || '');

    const existingUser = await usersCollection.findOne({
        $or: [{ username }, { email }],
    });

    if (existingUser) {
        return res.status(409).json({
            success: false,
            message: 'Username or email is already in use',
        });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const now = new Date();
    const newUser = {
        username,
        email,
        passwordHash,
        bio: '',
        profileImage: null,
        createdAt: now,
        updatedAt: now,
        lastLoginAt: now,
    };

    const result = await usersCollection.insertOne(newUser);
    const userId = result.insertedId.toString();

    res.status(201).json({
        success: true,
        message: 'Account created',
        token: signAccessToken(userId),
        refreshToken: signRefreshToken(userId),
        user: serializeAuthUser({ ...newUser, _id: result.insertedId }),
    });
});

exports.login = asyncHandler(async (req, res) => {
    ensureValidRequest(req);

    const usersCollection = getCollection('users');
    const email = normalizeEmail(req.body.email);
    const password = String(req.body.password || '');
    const user = await usersCollection.findOne({ email });

    if (!user) {
        return res.status(401).json({
            success: false,
            message: 'Invalid email or password',
        });
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);

    if (!isMatch) {
        return res.status(401).json({
            success: false,
            message: 'Invalid email or password',
        });
    }

    await usersCollection.updateOne(
        { _id: user._id },
        {
            $set: {
                lastLoginAt: new Date(),
                updatedAt: new Date(),
            },
        }
    );

    res.json({
        success: true,
        message: 'Login successful',
        token: signAccessToken(user._id.toString()),
        refreshToken: signRefreshToken(user._id.toString()),
        user: serializeAuthUser(user),
    });
});

exports.refreshToken = asyncHandler(async (req, res) => {
    const refreshToken = String(req.body.refreshToken || '').trim();

    if (!refreshToken) {
        return res.status(400).json({
            success: false,
            message: 'Refresh token is required',
        });
    }

    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    const userId = toObjectId(decoded.userId);

    if (!userId) {
        return res.status(401).json({
            success: false,
            message: 'Invalid refresh token',
        });
    }

    const user = await getCollection('users').findOne({ _id: userId });

    if (!user) {
        return res.status(401).json({
            success: false,
            message: 'Invalid refresh token',
        });
    }

    res.json({
        success: true,
        token: signAccessToken(userId.toString()),
        refreshToken: signRefreshToken(userId.toString()),
    });
});

exports.getCurrentUser = asyncHandler(async (req, res) => {
    const userId = toObjectId(req.userId);

    if (!userId) {
        return res.status(401).json({
            success: false,
            message: 'Invalid token',
        });
    }

    const user = await getCollection('users').findOne({ _id: userId });

    if (!user) {
        return res.status(404).json({
            success: false,
            message: 'User not found',
        });
    }

    res.json({
        success: true,
        user: serializeAuthUser(user),
    });
});

exports.logout = asyncHandler(async (req, res) => {
    res.json({
        success: true,
        message: 'Logout successful',
    });
});
