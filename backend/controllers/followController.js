/**
 * Follow Controller
 */

const { ObjectId } = require('mongodb');
const { getCollection } = require('../utils/database');

exports.followUser = async (req, res, next) => {
    try {
        const { userId } = req.params;
        const currentUserId = req.userId;

        if (userId === currentUserId) {
            return res.status(400).json({
                success: false,
                message: 'Cannot follow yourself',
            });
        }

        const usersCollection = getCollection('users');
        const notificationsCollection = getCollection('notifications');

        // Add to following
        await usersCollection.updateOne(
            { _id: new ObjectId(currentUserId) },
            { $addToSet: { following: new ObjectId(userId) } }
        );

        // Add to followers
        await usersCollection.updateOne(
            { _id: new ObjectId(userId) },
            { $addToSet: { followers: new ObjectId(currentUserId) } }
        );

        // Create notification
        await notificationsCollection.insertOne({
            userId: new ObjectId(userId),
            type: 'follow',
            relatedUserId: new ObjectId(currentUserId),
            read: false,
            createdAt: new Date(),
        });

        res.json({ success: true, message: 'User followed' });
    } catch (error) {
        next(error);
    }
};

exports.unfollowUser = async (req, res, next) => {
    try {
        const { userId } = req.params;
        const currentUserId = req.userId;

        const usersCollection = getCollection('users');

        // Remove from following
        await usersCollection.updateOne(
            { _id: new ObjectId(currentUserId) },
            { $pull: { following: new ObjectId(userId) } }
        );

        // Remove from followers
        await usersCollection.updateOne(
            { _id: new ObjectId(userId) },
            { $pull: { followers: new ObjectId(currentUserId) } }
        );

        res.json({ success: true, message: 'User unfollowed' });
    } catch (error) {
        next(error);
    }
};

exports.getFollowers = async (req, res, next) => {
    try {
        const { userId } = req.params;

        const usersCollection = getCollection('users');

        const user = await usersCollection.findOne(
            { _id: new ObjectId(userId) },
            { projection: { followers: 1 } }
        );

        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        const followers = await usersCollection
            .find({
                _id: { $in: user.followers },
            })
            .project({ password: 0 })
            .toArray();

        res.json({ success: true, followers });
    } catch (error) {
        next(error);
    }
};

exports.getFollowing = async (req, res, next) => {
    try {
        const { userId } = req.params;

        const usersCollection = getCollection('users');

        const user = await usersCollection.findOne(
            { _id: new ObjectId(userId) },
            { projection: { following: 1 } }
        );

        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        const following = await usersCollection
            .find({
                _id: { $in: user.following },
            })
            .project({ password: 0 })
            .toArray();

        res.json({ success: true, following });
    } catch (error) {
        next(error);
    }
};
