/**
 * Search Controller
 */

const { ObjectId } = require('mongodb');
const { getCollection } = require('../utils/database');

exports.searchUsers = async (req, res, next) => {
    try {
        const { q } = req.query;

        if (!q || q.trim().length < 2) {
            return res.status(400).json({
                success: false,
                message: 'Search query must be at least 2 characters',
            });
        }

        const usersCollection = getCollection('users');

        const users = await usersCollection
            .find({
                $or: [
                    { username: { $regex: q, $options: 'i' } },
                    { name: { $regex: q, $options: 'i' } },
                ],
            })
            .limit(20)
            .toArray();

        users.forEach((user) => delete user.password);

        res.json({ success: true, users });
    } catch (error) {
        next(error);
    }
};

exports.searchPosts = async (req, res, next) => {
    try {
        const { q } = req.query;

        if (!q || q.trim().length < 2) {
            return res.status(400).json({
                success: false,
                message: 'Search query must be at least 2 characters',
            });
        }

        const postsCollection = getCollection('posts');

        const posts = await postsCollection
            .find({
                caption: { $regex: q, $options: 'i' },
            })
            .limit(20)
            .toArray();

        res.json({ success: true, posts });
    } catch (error) {
        next(error);
    }
};
