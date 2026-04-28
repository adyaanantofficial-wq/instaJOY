const { getCollection } = require('../utils/database');
const asyncHandler = require('../utils/asyncHandler');
const { compressImageDataUri, MAX_IMAGE_BYTES } = require('../utils/media');
const { createNotification } = require('../utils/notifications');
const { serializeComments, serializePosts } = require('../utils/serializers');
const { sanitizePlainText, toObjectId, uniqueObjectIds } = require('../utils/text');

const TEXT_POST_CATEGORIES = new Set(['jokes', 'ideas', 'fun-knowledge']);

async function getPersonalizedFeedFilter(viewerId) {
    if (!viewerId) {
        return {};
    }

    const follows = await getCollection('follows')
        .find({ followerId: viewerId })
        .project({ followingId: 1 })
        .toArray();

    const followedIds = uniqueObjectIds([viewerId, ...follows.map((row) => row.followingId)]);

    if (!followedIds.length || followedIds.length === 1) {
        return {};
    }

    return {
        userId: { $in: followedIds },
    };
}

exports.createPost = asyncHandler(async (req, res) => {
    const userId = toObjectId(req.userId);
    const type = String(req.body.type || '').trim();
    const text = sanitizePlainText(req.body.text, 500);
    const category = String(req.body.category || '').trim();

    if (!userId) {
        return res.status(401).json({
            success: false,
            message: 'Authentication required',
        });
    }

    if (!['text', 'image'].includes(type)) {
        return res.status(400).json({
            success: false,
            message: 'Post type must be text or image',
        });
    }

    if (type === 'text') {
        if (!text) {
            return res.status(400).json({
                success: false,
                message: 'Text posts cannot be empty',
            });
        }

        if (!TEXT_POST_CATEGORIES.has(category)) {
            return res.status(400).json({
                success: false,
                message: 'Text posts must use jokes, ideas, or fun-knowledge category',
            });
        }
    }

    let imageData = null;
    let imageMimeType = null;
    let imageSizeBytes = 0;

    if (type === 'image') {
        if (!req.body.imageData) {
            return res.status(400).json({
                success: false,
                message: 'Image posts require media',
            });
        }

        const compressed = await compressImageDataUri(req.body.imageData, {
            maxBytes: MAX_IMAGE_BYTES,
            maxWidth: 1440,
            maxHeight: 1440,
        });

        imageData = compressed.dataUri;
        imageMimeType = compressed.mimeType;
        imageSizeBytes = compressed.sizeBytes;
    }

    const now = new Date();
    const post = {
        userId,
        type,
        category: type === 'text' ? category : null,
        text,
        imageData,
        imageMimeType,
        imageSizeBytes,
        createdAt: now,
        updatedAt: now,
    };

    const result = await getCollection('posts').insertOne(post);
    const createdPost = { ...post, _id: result.insertedId };

    res.status(201).json({
        success: true,
        message: 'Post created',
        post: (await serializePosts([createdPost], userId))[0],
    });
});

exports.getFeed = asyncHandler(async (req, res) => {
    const viewerId = toObjectId(req.userId);
    const cursor = toObjectId(req.query.cursor);
    const limit = Math.min(15, Math.max(1, Number.parseInt(req.query.limit, 10) || 10));
    const feedFilter = await getPersonalizedFeedFilter(viewerId);
    const query = { ...feedFilter };

    if (cursor) {
        query._id = { $lt: cursor };
    }

    const posts = await getCollection('posts')
        .find(query)
        .sort({ _id: -1 })
        .limit(limit + 1)
        .toArray();

    const hasMore = posts.length > limit;
    const pageItems = hasMore ? posts.slice(0, limit) : posts;
    const serializedPosts = await serializePosts(pageItems, viewerId);

    res.json({
        success: true,
        posts: serializedPosts,
        nextCursor: hasMore ? pageItems[pageItems.length - 1]._id.toString() : null,
        hasMore,
    });
});

exports.getPostById = asyncHandler(async (req, res) => {
    const viewerId = toObjectId(req.userId);
    const postId = toObjectId(req.params.postId);

    if (!postId) {
        return res.status(400).json({
            success: false,
            message: 'Invalid post id',
        });
    }

    const post = await getCollection('posts').findOne({ _id: postId });

    if (!post) {
        return res.status(404).json({
            success: false,
            message: 'Post not found',
        });
    }

    res.json({
        success: true,
        post: (await serializePosts([post], viewerId))[0],
    });
});

exports.getUserPosts = asyncHandler(async (req, res) => {
    const viewerId = toObjectId(req.userId);
    const username = String(req.params.username || '').trim().toLowerCase();
    const user = await getCollection('users').findOne({ username });

    if (!user) {
        return res.status(404).json({
            success: false,
            message: 'User not found',
        });
    }

    const posts = await getCollection('posts')
        .find({ userId: user._id })
        .sort({ _id: -1 })
        .limit(60)
        .toArray();

    res.json({
        success: true,
        posts: await serializePosts(posts, viewerId),
    });
});

exports.likePost = asyncHandler(async (req, res) => {
    const userId = toObjectId(req.userId);
    const postId = toObjectId(req.params.postId);

    if (!userId || !postId) {
        return res.status(400).json({
            success: false,
            message: 'Invalid request',
        });
    }

    const postsCollection = getCollection('posts');
    const likesCollection = getCollection('likes');
    const post = await postsCollection.findOne({ _id: postId });

    if (!post) {
        return res.status(404).json({
            success: false,
            message: 'Post not found',
        });
    }

    const existing = await likesCollection.findOne({
        userId,
        targetType: 'post',
        targetId: postId,
    });

    if (!existing) {
        await likesCollection.insertOne({
            userId,
            targetType: 'post',
            targetId: postId,
            createdAt: new Date(),
        });

        await createNotification({
            userId: post.userId,
            actorUserId: userId,
            type: 'like',
            entityType: 'post',
            entityId: postId,
            text: 'liked your post',
        });
    }

    res.json({
        success: true,
        message: 'Post liked',
    });
});

exports.unlikePost = asyncHandler(async (req, res) => {
    const userId = toObjectId(req.userId);
    const postId = toObjectId(req.params.postId);

    if (!userId || !postId) {
        return res.status(400).json({
            success: false,
            message: 'Invalid request',
        });
    }

    await getCollection('likes').deleteOne({
        userId,
        targetType: 'post',
        targetId: postId,
    });

    res.json({
        success: true,
        message: 'Post unliked',
    });
});

exports.getComments = asyncHandler(async (req, res) => {
    const postId = toObjectId(req.params.postId);

    if (!postId) {
        return res.status(400).json({
            success: false,
            message: 'Invalid post id',
        });
    }

    const post = await getCollection('posts').findOne({ _id: postId });

    if (!post) {
        return res.status(404).json({
            success: false,
            message: 'Post not found',
        });
    }

    const comments = await getCollection('comments')
        .find({
            targetType: 'post',
            targetId: postId,
        })
        .sort({ createdAt: 1 })
        .limit(80)
        .toArray();

    res.json({
        success: true,
        comments: await serializeComments(comments),
    });
});

exports.commentOnPost = asyncHandler(async (req, res) => {
    const userId = toObjectId(req.userId);
    const postId = toObjectId(req.params.postId);
    const text = sanitizePlainText(req.body.text, 280);

    if (!userId || !postId) {
        return res.status(400).json({
            success: false,
            message: 'Invalid request',
        });
    }

    if (!text) {
        return res.status(400).json({
            success: false,
            message: 'Comment cannot be empty',
        });
    }

    const post = await getCollection('posts').findOne({ _id: postId });

    if (!post) {
        return res.status(404).json({
            success: false,
            message: 'Post not found',
        });
    }

    const comment = {
        userId,
        targetType: 'post',
        targetId: postId,
        text,
        createdAt: new Date(),
    };

    const result = await getCollection('comments').insertOne(comment);

    await createNotification({
        userId: post.userId,
        actorUserId: userId,
        type: 'comment',
        entityType: 'post',
        entityId: postId,
        text: 'commented on your post',
    });

    res.status(201).json({
        success: true,
        message: 'Comment added',
        comment: (await serializeComments([{ ...comment, _id: result.insertedId }]))[0],
    });
});

exports.deletePost = asyncHandler(async (req, res) => {
    const userId = toObjectId(req.userId);
    const postId = toObjectId(req.params.postId);

    if (!userId || !postId) {
        return res.status(400).json({
            success: false,
            message: 'Invalid request',
        });
    }

    const post = await getCollection('posts').findOne({ _id: postId });

    if (!post) {
        return res.status(404).json({
            success: false,
            message: 'Post not found',
        });
    }

    if (post.userId.toString() !== userId.toString()) {
        return res.status(403).json({
            success: false,
            message: 'You can only delete your own posts',
        });
    }

    await Promise.all([
        getCollection('posts').deleteOne({ _id: postId }),
        getCollection('likes').deleteMany({ targetType: 'post', targetId: postId }),
        getCollection('comments').deleteMany({ targetType: 'post', targetId: postId }),
        getCollection('notifications').deleteMany({ entityType: 'post', entityId: postId }),
    ]);

    res.json({
        success: true,
        message: 'Post deleted',
    });
});
