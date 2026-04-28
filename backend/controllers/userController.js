const { getCollection } = require('../utils/database');
const asyncHandler = require('../utils/asyncHandler');
const { MAX_AVATAR_BYTES, compressImageDataUri } = require('../utils/media');
const { serializeUserSummary } = require('../utils/serializers');
const { normalizeUsername, sanitizePlainText, toObjectId } = require('../utils/text');
const { ensureValidRequest } = require('../utils/validation');

async function buildProfilePayload(user, viewerId) {
    const followsCollection = getCollection('follows');
    const postsCollection = getCollection('posts');
    const reelsCollection = getCollection('reels');

    const [followerCount, followingCount, postCount, reelCount, isFollowing] = await Promise.all([
        followsCollection.countDocuments({ followingId: user._id }),
        followsCollection.countDocuments({ followerId: user._id }),
        postsCollection.countDocuments({ userId: user._id }),
        reelsCollection.countDocuments({ userId: user._id }),
        viewerId
            ? followsCollection.countDocuments({
                  followerId: viewerId,
                  followingId: user._id,
              })
            : 0,
    ]);

    return {
        ...serializeUserSummary(user),
        followerCount,
        followingCount,
        postCount,
        reelCount,
        isFollowing: Boolean(isFollowing),
        isOwnProfile: viewerId ? viewerId.toString() === user._id.toString() : false,
    };
}

exports.getCurrentProfile = asyncHandler(async (req, res) => {
    const userId = toObjectId(req.userId);
    const user = userId ? await getCollection('users').findOne({ _id: userId }) : null;

    if (!user) {
        return res.status(404).json({
            success: false,
            message: 'User not found',
        });
    }

    res.json({
        success: true,
        profile: await buildProfilePayload(user, userId),
    });
});

exports.getUserByUsername = asyncHandler(async (req, res) => {
    const username = normalizeUsername(req.params.username);
    const viewerId = toObjectId(req.userId);
    const user = await getCollection('users').findOne({ username });

    if (!user) {
        return res.status(404).json({
            success: false,
            message: 'User not found',
        });
    }

    res.json({
        success: true,
        profile: await buildProfilePayload(user, viewerId),
    });
});

exports.updateProfile = asyncHandler(async (req, res) => {
    ensureValidRequest(req);

    const userId = toObjectId(req.userId);

    if (!userId) {
        return res.status(401).json({
            success: false,
            message: 'Invalid token',
        });
    }

    const update = {
        updatedAt: new Date(),
    };

    if (typeof req.body.bio === 'string') {
        update.bio = sanitizePlainText(req.body.bio, 160);
    }

    if (req.body.profileImage) {
        const compressed = await compressImageDataUri(req.body.profileImage, {
            maxBytes: MAX_AVATAR_BYTES,
            maxWidth: 512,
            maxHeight: 512,
        });
        update.profileImage = compressed.dataUri;
    } else if (req.body.removeProfileImage) {
        update.profileImage = null;
    }

    await getCollection('users').updateOne(
        { _id: userId },
        {
            $set: update,
        }
    );

    const user = await getCollection('users').findOne({ _id: userId });

    res.json({
        success: true,
        message: 'Profile updated',
        profile: await buildProfilePayload(user, userId),
    });
});
