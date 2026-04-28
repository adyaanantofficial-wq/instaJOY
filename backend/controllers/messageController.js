/**
 * Message Controller
 */

const { ObjectId } = require('mongodb');
const { getCollection } = require('../utils/database');

exports.sendMessage = async (req, res, next) => {
    try {
        const { receiverId, text } = req.body;
        const senderId = req.userId;

        if (!text || text.trim().length === 0) {
            return res.status(400).json({ success: false, message: 'Message cannot be empty' });
        }

        const messagesCollection = getCollection('messages');

        const message = {
            senderId: new ObjectId(senderId),
            receiverId: new ObjectId(receiverId),
            text: text.trim(),
            read: false,
            createdAt: new Date(),
        };

        const result = await messagesCollection.insertOne(message);

        res.status(201).json({
            success: true,
            message: { ...message, _id: result.insertedId },
        });
    } catch (error) {
        next(error);
    }
};

exports.getMessages = async (req, res, next) => {
    try {
        const { userId } = req.params;
        const currentUserId = req.userId;

        const messagesCollection = getCollection('messages');

        const messages = await messagesCollection
            .find({
                $or: [
                    { senderId: new ObjectId(currentUserId), receiverId: new ObjectId(userId) },
                    { senderId: new ObjectId(userId), receiverId: new ObjectId(currentUserId) },
                ],
            })
            .sort({ createdAt: 1 })
            .toArray();

        res.json({ success: true, messages });
    } catch (error) {
        next(error);
    }
};

exports.getConversations = async (req, res, next) => {
    try {
        const userId = req.userId;
        const messagesCollection = getCollection('messages');

        const conversations = await messagesCollection
            .aggregate([
                {
                    $match: {
                        $or: [
                            { senderId: new ObjectId(userId) },
                            { receiverId: new ObjectId(userId) },
                        ],
                    },
                },
                {
                    $sort: { createdAt: -1 },
                },
                {
                    $group: {
                        _id: {
                            $cond: [
                                { $eq: ['$senderId', new ObjectId(userId)] },
                                '$receiverId',
                                '$senderId',
                            ],
                        },
                        lastMessage: { $first: '$$ROOT' },
                    },
                },
                {
                    $lookup: {
                        from: 'users',
                        localField: '_id',
                        foreignField: '_id',
                        as: 'user',
                    },
                },
                { $unwind: '$user' },
            ])
            .toArray();

        res.json({ success: true, conversations });
    } catch (error) {
        next(error);
    }
};
