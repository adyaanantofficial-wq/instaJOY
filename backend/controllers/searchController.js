const { getCollection } = require('../utils/database');
const asyncHandler = require('../utils/asyncHandler');
const { serializePosts, serializeUserSummary } = require('../utils/serializers');
const { escapeRegex, toObjectId } = require('../utils/text');

async function findUsers(query) {
    const users = await getCollection('users')
        .find({
            username: { $regex: escapeRegex(query), $options: 'i' },
        })
        .project({ username: 1, bio: 1, profileImage: 1, createdAt: 1, updatedAt: 1 })
        .limit(15)
        .toArray();

    return users.map(serializeUserSummary);
}

async function findPosts(query, viewerId) {
    const posts = await getCollection('posts')
        .find({
            type: 'text',
            text: { $regex: escapeRegex(query), $options: 'i' },
        })
        .sort({ createdAt: -1 })
        .limit(15)
        .toArray();

    return serializePosts(posts, viewerId);
}

exports.searchAll = asyncHandler(async (req, res) => {
    const q = String(req.query.q || '').trim();
    const viewerId = toObjectId(req.userId);

    if (q.length < 2) {
        return res.status(400).json({
            success: false,
            message: 'Search query must be at least 2 characters',
        });
    }

    const [users, posts] = await Promise.all([findUsers(q), findPosts(q, viewerId)]);

    res.json({
        success: true,
        users,
        posts,
    });
});

exports.searchUsers = asyncHandler(async (req, res) => {
    const q = String(req.query.q || '').trim();

    if (q.length < 2) {
        return res.status(400).json({
            success: false,
            message: 'Search query must be at least 2 characters',
        });
    }

    res.json({
        success: true,
        users: await findUsers(q),
    });
});

exports.searchPosts = asyncHandler(async (req, res) => {
    const q = String(req.query.q || '').trim();
    const viewerId = toObjectId(req.userId);

    if (q.length < 2) {
        return res.status(400).json({
            success: false,
            message: 'Search query must be at least 2 characters',
        });
    }

    res.json({
        success: true,
        posts: await findPosts(q, viewerId),
    });
});
