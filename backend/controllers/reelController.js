/**
 * Reel Controller - Handles short video posts
 */

const { ObjectId } = require('mongodb');
const { getCollection } = require('../utils/database');

exports.createReel = async (req, res, next) => {
    try {
        const { caption, videoUrl } = req.body;
        const userId = req.userId;

        if (!videoUrl) {
            return res.status(400).json({ success: false, message: 'Video URL required' });
        }

        const reelsCollection = getCollection('reels');

        const reel = {
            authorId: new ObjectId(userId),
            caption: caption || '',
            videoUrl,
            likes: [],
            comments: [],
            views: 0,
            createdAt: new Date(),
        };

        const result = await reelsCollection.insertOne(reel);

        res.status(201).json({
            success: true,
            reel: { ...reel, _id: result.insertedId },
        });
    } catch (error) {
        next(error);
    }
};

exports.getReelsFeed = async (req, res, next) => {
    try {
        const skip = parseInt(req.query.skip) || 0;
        const userId = req.userId;

        const reelsCollection = getCollection('reels');

        const reels = await reelsCollection
            .aggregate([
                { $sort: { createdAt: -1 } },
                { $skip: skip },
                { $limit: 20 },
                {
                    $lookup: {
                        from: 'users',
                        localField: 'authorId',
                        foreignField: '_id',
                        as: 'author',
                    },
                },
                { $unwind: '$author' },
            ])
            .toArray();

        const reelsWithStatus = reels.map((reel) => ({
            ...reel,
            isLiked: userId
                ? reel.likes.some((id) => id.equals(new ObjectId(userId)))
                : false,
        }));

        res.json({ success: true, reels: reelsWithStatus });
    } catch (error) {
        next(error);
    }
};

exports.likeReel = async (req, res, next) => {
    try {
        const { reelId } = req.params;
        const userId = req.userId;

        const reelsCollection = getCollection('reels');

        const reel = await reelsCollection.findOne({ _id: new ObjectId(reelId) });

        if (!reel) {
            return res.status(404).json({ success: false, message: 'Reel not found' });
        }

        const alreadyLiked = reel.likes.some((id) => id.equals(new ObjectId(userId)));

        if (!alreadyLiked) {
            await reelsCollection.updateOne(
                { _id: new ObjectId(reelId) },
                { $push: { likes: new ObjectId(userId) } }
            );
        }

        res.json({ success: true, message: 'Reel liked' });
    } catch (error) {
        next(error);
    }
};

exports.commentReel = async (req, res, next) => {
    try {
        const { reelId } = req.params;
        const { text } = req.body;
        const userId = req.userId;

        const reelsCollection = getCollection('reels');

        const comment = {
            _id: new ObjectId(),
            authorId: new ObjectId(userId),
            text,
            createdAt: new Date(),
        };

        await reelsCollection.updateOne(
            { _id: new ObjectId(reelId) },
            { $push: { comments: comment } }
        );

        res.status(201).json({ success: true, comment });
    } catch (error) {
        next(error);
    }
};
