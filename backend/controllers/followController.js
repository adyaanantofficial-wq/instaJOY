const { getCollection } = require('../utils/database');
const asyncHandler = require('../utils/asyncHandler');
const { createNotification } = require('../utils/notifications');
const { serializeUserSummary } = require('../utils/serializers');
const { toObjectId } = require('../utils/text');

async function getUserListByIds(ids) {
    if (!ids.length) {
        return [];
    }

    const users = await getCollection('users')
        .find({ _id: { $in: ids } })
        .project({ username: 1, bio: 1, profileImage: 1, createdAt: 1, updatedAt: 1 })
        .toArray();

    return users.map(serializeUserSummary);
}

exports.followUser = asyncHandler(async (req, res) => {
    const currentUserId = toObjectId(req.userId);
    const targetUserId = toObjectId(req.params.userId);

    if (!currentUserId || !targetUserId) {
        return res.status(400).json({
            success: false,
            message: 'Invalid user id',
        });
    }

    if (currentUserId.toString() === targetUserId.toString()) {
        return res.status(400).json({
            success: false,
            message: 'You cannot follow yourself',
        });
    }

    const usersCollection = getCollection('users');
    const targetUser = await usersCollection.findOne({ _id: targetUserId });

    if (!targetUser) {
        return res.status(404).json({
            success: false,
            message: 'User not found',
        });
    }

    const followsCollection = getCollection('follows');
    const existing = await followsCollection.findOne({
        followerId: currentUserId,
        followingId: targetUserId,
    });

    if (!existing) {
        await followsCollection.insertOne({
            followerId: currentUserId,
            followingId: targetUserId,
            createdAt: new Date(),
        });

        await createNotification({
            userId: targetUserId,
            actorUserId: currentUserId,
            type: 'follow',
            entityType: 'user',
            entityId: currentUserId,
            text: 'started following you',
        });
    }

    res.json({
        success: true,
        message: 'User followed',
    });
});

exports.unfollowUser = asyncHandler(async (req, res) => {
    const currentUserId = toObjectId(req.userId);
    const targetUserId = toObjectId(req.params.userId);

    if (!currentUserId || !targetUserId) {
        return res.status(400).json({
            success: false,
            message: 'Invalid user id',
        });
    }

    await getCollection('follows').deleteOne({
        followerId: currentUserId,
        followingId: targetUserId,
    });

    res.json({
        success: true,
        message: 'User unfollowed',
    });
});

exports.getFollowers = asyncHandler(async (req, res) => {
    const userId = toObjectId(req.params.userId);

    if (!userId) {
        return res.status(400).json({
            success: false,
            message: 'Invalid user id',
        });
    }

    const follows = await getCollection('follows')
        .find({ followingId: userId })
        .sort({ createdAt: -1 })
        .toArray();

    const followers = await getUserListByIds(follows.map((row) => row.followerId));

    res.json({
        success: true,
        followers,
    });
});

exports.getFollowing = asyncHandler(async (req, res) => {
    const userId = toObjectId(req.params.userId);

    if (!userId) {
        return res.status(400).json({
            success: false,
            message: 'Invalid user id',
        });
    }

    const follows = await getCollection('follows')
        .find({ followerId: userId })
        .sort({ createdAt: -1 })
        .toArray();

    const following = await getUserListByIds(follows.map((row) => row.followingId));

    res.json({
        success: true,
        following,
    });
});
