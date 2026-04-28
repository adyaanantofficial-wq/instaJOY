const { getCollection } = require('./database');
const { uniqueObjectIds } = require('./text');

function serializeUserSummary(user) {
    if (!user) {
        return null;
    }

    return {
        id: user._id.toString(),
        username: user.username,
        bio: user.bio || '',
        profileImage: user.profileImage || null,
        createdAt: user.createdAt || null,
        updatedAt: user.updatedAt || null,
    };
}

async function getUserMap(userIds) {
    const ids = uniqueObjectIds(userIds);

    if (!ids.length) {
        return new Map();
    }

    const users = await getCollection('users')
        .find({ _id: { $in: ids } })
        .project({ username: 1, bio: 1, profileImage: 1, createdAt: 1, updatedAt: 1 })
        .toArray();

    return new Map(users.map((user) => [user._id.toString(), user]));
}

async function getInteractionMaps(targetType, targetIds, viewerId) {
    const ids = uniqueObjectIds(targetIds);
    const likesCollection = getCollection('likes');
    const commentsCollection = getCollection('comments');
    const likeCounts = new Map();
    const commentCounts = new Map();
    const likedSet = new Set();

    if (!ids.length) {
        return { likeCounts, commentCounts, likedSet };
    }

    const [likeRows, commentRows] = await Promise.all([
        likesCollection
            .aggregate([
                {
                    $match: {
                        targetType,
                        targetId: { $in: ids },
                    },
                },
                {
                    $group: {
                        _id: '$targetId',
                        count: { $sum: 1 },
                    },
                },
            ])
            .toArray(),
        commentsCollection
            .aggregate([
                {
                    $match: {
                        targetType,
                        targetId: { $in: ids },
                    },
                },
                {
                    $group: {
                        _id: '$targetId',
                        count: { $sum: 1 },
                    },
                },
            ])
            .toArray(),
    ]);

    likeRows.forEach((row) => likeCounts.set(row._id.toString(), row.count));
    commentRows.forEach((row) => commentCounts.set(row._id.toString(), row.count));

    if (viewerId) {
        const viewerLikes = await likesCollection
            .find({
                targetType,
                targetId: { $in: ids },
                userId: viewerId,
            })
            .project({ targetId: 1 })
            .toArray();

        viewerLikes.forEach((row) => likedSet.add(row.targetId.toString()));
    }

    return { likeCounts, commentCounts, likedSet };
}

async function serializePosts(posts, viewerId) {
    const userMap = await getUserMap(posts.map((post) => post.userId));
    const { likeCounts, commentCounts, likedSet } = await getInteractionMaps(
        'post',
        posts.map((post) => post._id),
        viewerId
    );

    return posts.map((post) => ({
        id: post._id.toString(),
        type: post.type,
        category: post.category || null,
        text: post.text || '',
        imageData: post.imageData || null,
        imageMimeType: post.imageMimeType || null,
        imageSizeBytes: post.imageSizeBytes || 0,
        createdAt: post.createdAt,
        updatedAt: post.updatedAt,
        likeCount: likeCounts.get(post._id.toString()) || 0,
        commentCount: commentCounts.get(post._id.toString()) || 0,
        isLiked: likedSet.has(post._id.toString()),
        author: serializeUserSummary(userMap.get(post.userId.toString())),
    }));
}

async function serializeReels(reels, viewerId) {
    const userMap = await getUserMap(reels.map((reel) => reel.userId));
    const { likeCounts, commentCounts, likedSet } = await getInteractionMaps(
        'reel',
        reels.map((reel) => reel._id),
        viewerId
    );

    return reels.map((reel) => ({
        id: reel._id.toString(),
        caption: reel.caption || '',
        videoData: reel.videoData,
        videoMimeType: reel.videoMimeType,
        videoSizeBytes: reel.videoSizeBytes,
        durationSeconds: reel.durationSeconds,
        createdAt: reel.createdAt,
        updatedAt: reel.updatedAt,
        likeCount: likeCounts.get(reel._id.toString()) || 0,
        commentCount: commentCounts.get(reel._id.toString()) || 0,
        isLiked: likedSet.has(reel._id.toString()),
        author: serializeUserSummary(userMap.get(reel.userId.toString())),
    }));
}

async function serializeComments(comments) {
    const userMap = await getUserMap(comments.map((comment) => comment.userId));

    return comments.map((comment) => ({
        id: comment._id.toString(),
        text: comment.text,
        targetType: comment.targetType,
        targetId: comment.targetId.toString(),
        createdAt: comment.createdAt,
        author: serializeUserSummary(userMap.get(comment.userId.toString())),
    }));
}

module.exports = {
    getInteractionMaps,
    getUserMap,
    serializeComments,
    serializePosts,
    serializeReels,
    serializeUserSummary,
};
