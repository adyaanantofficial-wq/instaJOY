/**
 * User Controller
 */

const User = require('../models/User');

/**
 * Get user by username
 * GET /api/user/:username
 */
exports.getUserByUsername = async (req, res, next) => {
    try {
        const { username } = req.params;

        const user = await User.findOne({ username }).populate('followers following');

        if (!user || !user.isActive) {
            return res.status(404).json({
                success: false,
                message: 'User not found',
            });
        }

        res.status(200).json({
            success: true,
            user: {
                _id: user._id,
                username: user.username,
                email: user.email,
                bio: user.bio,
                profileImage: user.profileImage,
                followers: user.followers,
                following: user.following,
                postsCount: user.postsCount,
                createdAt: user.createdAt,
            },
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Update user profile
 * POST /api/user/profile/update
 */
exports.updateProfile = async (req, res, next) => {
    try {
        const { bio, profileImage } = req.body;
        const userId = req.user.userId;

        const updateData = {};

        if (bio !== undefined) {
            if (bio.length > 150) {
                return res.status(400).json({
                    success: false,
                    message: 'Bio must be 150 characters or less',
                });
            }
            updateData.bio = bio;
        }

        if (profileImage) {
            // Validate base64 image
            if (profileImage.length > 5242880) {
                // 5MB limit
                return res.status(400).json({
                    success: false,
                    message: 'Image too large (max 5MB)',
                });
            }
            updateData.profileImage = profileImage;
        }

        const user = await User.findByIdAndUpdate(userId, updateData, {
            new: true,
            runValidators: true,
        });

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found',
            });
        }

        res.status(200).json({
            success: true,
            message: 'Profile updated',
            user,
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Follow user
 * POST /api/user/follow
 */
exports.followUser = async (req, res, next) => {
    try {
        const { userId } = req.body;
        const currentUserId = req.user.userId;

        if (currentUserId === userId) {
            return res.status(400).json({
                success: false,
                message: 'Cannot follow yourself',
            });
        }

        // Add to current user's following
        await User.findByIdAndUpdate(currentUserId, {
            $addToSet: { following: userId },
        });

        // Add to target user's followers
        const targetUser = await User.findByIdAndUpdate(userId, {
            $addToSet: { followers: currentUserId },
        });

        if (!targetUser) {
            return res.status(404).json({
                success: false,
                message: 'User not found',
            });
        }

        res.status(200).json({
            success: true,
            message: 'Followed user',
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Unfollow user
 * POST /api/user/unfollow
 */
exports.unfollowUser = async (req, res, next) => {
    try {
        const { userId } = req.body;
        const currentUserId = req.user.userId;

        // Remove from current user's following
        await User.findByIdAndUpdate(currentUserId, {
            $pull: { following: userId },
        });

        // Remove from target user's followers
        const targetUser = await User.findByIdAndUpdate(userId, {
            $pull: { followers: currentUserId },
        });

        if (!targetUser) {
            return res.status(404).json({
                success: false,
                message: 'User not found',
            });
        }

        res.status(200).json({
            success: true,
            message: 'Unfollowed user',
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Get suggested users
 * GET /api/user/suggested
 */
exports.getSuggestedUsers = async (req, res, next) => {
    try {
        const currentUserId = req.user.userId;
        const limit = parseInt(req.query.limit) || 5;

        const currentUser = await User.findById(currentUserId);

        // Get users that current user is not following and are not themselves
        const suggestedUsers = await User.find({
            _id: {
                $ne: currentUserId,
                $nin: currentUser.following,
            },
            isActive: true,
        })
            .select('username profileImage bio followers')
            .limit(limit);

        res.status(200).json({
            success: true,
            users: suggestedUsers,
        });
    } catch (error) {
        next(error);
    }
};
