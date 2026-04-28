const { getCollection } = require('../utils/database');
const asyncHandler = require('../utils/asyncHandler');
const { createNotification } = require('../utils/notifications');
const { serializeComments, serializeReels } = require('../utils/serializers');
const { sanitizePlainText, toObjectId } = require('../utils/text');
const { validateVideoDataUri } = require('../utils/media');

exports.createReel = asyncHandler(async (req, res) => {
    const userId = toObjectId(req.userId);
    const caption = sanitizePlainText(req.body.caption, 500);

    if (!userId) {
        return res.status(401).json({
            success: false,
            message: 'Authentication required',
        });
    }

    if (!req.body.videoData) {
        return res.status(400).json({
            success: false,
            message: 'Reel media is required',
        });
    }

    const validatedVideo = validateVideoDataUri(
        req.body.videoData,
        Number.parseFloat(req.body.durationSeconds)
    );
    const now = new Date();
    const reel = {
        userId,
        caption,
        videoData: validatedVideo.dataUri,
        videoMimeType: validatedVideo.mimeType,
        videoSizeBytes: validatedVideo.sizeBytes,
        durationSeconds: validatedVideo.durationSeconds,
        createdAt: now,
        updatedAt: now,
    };

    const result = await getCollection('reels').insertOne(reel);

    res.status(201).json({
        success: true,
        message: 'Reel created',
        reel: (await serializeReels([{ ...reel, _id: result.insertedId }], userId))[0],
    });
});

exports.getReelsFeed = asyncHandler(async (req, res) => {
    const viewerId = toObjectId(req.userId);
    const cursor = toObjectId(req.query.cursor);
    const limit = Math.min(10, Math.max(1, Number.parseInt(req.query.limit, 10) || 6));
    const query = {};

    if (cursor) {
        query._id = { $lt: cursor };
    }

    const reels = await getCollection('reels')
        .find(query)
        .sort({ _id: -1 })
        .limit(limit + 1)
        .toArray();

    const hasMore = reels.length > limit;
    const pageItems = hasMore ? reels.slice(0, limit) : reels;

    res.json({
        success: true,
        reels: await serializeReels(pageItems, viewerId),
        nextCursor: hasMore ? pageItems[pageItems.length - 1]._id.toString() : null,
        hasMore,
    });
});

exports.likeReel = asyncHandler(async (req, res) => {
    const userId = toObjectId(req.userId);
    const reelId = toObjectId(req.params.reelId);

    if (!userId || !reelId) {
        return res.status(400).json({
            success: false,
            message: 'Invalid request',
        });
    }

    const reelsCollection = getCollection('reels');
    const likesCollection = getCollection('likes');
    const reel = await reelsCollection.findOne({ _id: reelId });

    if (!reel) {
        return res.status(404).json({
            success: false,
            message: 'Reel not found',
        });
    }

    const existing = await likesCollection.findOne({
        userId,
        targetType: 'reel',
        targetId: reelId,
    });

    if (!existing) {
        await likesCollection.insertOne({
            userId,
            targetType: 'reel',
            targetId: reelId,
            createdAt: new Date(),
        });

        await createNotification({
            userId: reel.userId,
            actorUserId: userId,
            type: 'like',
            entityType: 'reel',
            entityId: reelId,
            text: 'liked your reel',
        });
    }

    res.json({
        success: true,
        message: 'Reel liked',
    });
});

exports.unlikeReel = asyncHandler(async (req, res) => {
    const userId = toObjectId(req.userId);
    const reelId = toObjectId(req.params.reelId);

    if (!userId || !reelId) {
        return res.status(400).json({
            success: false,
            message: 'Invalid request',
        });
    }

    await getCollection('likes').deleteOne({
        userId,
        targetType: 'reel',
        targetId: reelId,
    });

    res.json({
        success: true,
        message: 'Reel unliked',
    });
});

exports.getComments = asyncHandler(async (req, res) => {
    const reelId = toObjectId(req.params.reelId);

    if (!reelId) {
        return res.status(400).json({
            success: false,
            message: 'Invalid reel id',
        });
    }

    const reel = await getCollection('reels').findOne({ _id: reelId });

    if (!reel) {
        return res.status(404).json({
            success: false,
            message: 'Reel not found',
        });
    }

    const comments = await getCollection('comments')
        .find({
            targetType: 'reel',
            targetId: reelId,
        })
        .sort({ createdAt: 1 })
        .limit(80)
        .toArray();

    res.json({
        success: true,
        comments: await serializeComments(comments),
    });
});

exports.commentReel = asyncHandler(async (req, res) => {
    const userId = toObjectId(req.userId);
    const reelId = toObjectId(req.params.reelId);
    const text = sanitizePlainText(req.body.text, 280);

    if (!userId || !reelId) {
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

    const reel = await getCollection('reels').findOne({ _id: reelId });

    if (!reel) {
        return res.status(404).json({
            success: false,
            message: 'Reel not found',
        });
    }

    const comment = {
        userId,
        targetType: 'reel',
        targetId: reelId,
        text,
        createdAt: new Date(),
    };

    const result = await getCollection('comments').insertOne(comment);

    await createNotification({
        userId: reel.userId,
        actorUserId: userId,
        type: 'comment',
        entityType: 'reel',
        entityId: reelId,
        text: 'commented on your reel',
    });

    res.status(201).json({
        success: true,
        message: 'Comment added',
        comment: (await serializeComments([{ ...comment, _id: result.insertedId }]))[0],
    });
});

exports.deleteReel = asyncHandler(async (req, res) => {
    const userId = toObjectId(req.userId);
    const reelId = toObjectId(req.params.reelId);

    if (!userId || !reelId) {
        return res.status(400).json({
            success: false,
            message: 'Invalid request',
        });
    }

    const reel = await getCollection('reels').findOne({ _id: reelId });

    if (!reel) {
        return res.status(404).json({
            success: false,
            message: 'Reel not found',
        });
    }

    if (reel.userId.toString() !== userId.toString()) {
        return res.status(403).json({
            success: false,
            message: 'You can only delete your own reels',
        });
    }

    await Promise.all([
        getCollection('reels').deleteOne({ _id: reelId }),
        getCollection('likes').deleteMany({ targetType: 'reel', targetId: reelId }),
        getCollection('comments').deleteMany({ targetType: 'reel', targetId: reelId }),
        getCollection('notifications').deleteMany({ entityType: 'reel', entityId: reelId }),
    ]);

    res.json({
        success: true,
        message: 'Reel deleted',
    });
});
