const { getCollection } = require('../utils/database');
const asyncHandler = require('../utils/asyncHandler');
const { createNotification } = require('../utils/notifications');
const { serializeUserSummary } = require('../utils/serializers');
const { sanitizePlainText, toObjectId } = require('../utils/text');

function getConversationKey(userA, userB) {
    return [userA.toString(), userB.toString()].sort().join(':');
}

exports.sendMessage = asyncHandler(async (req, res) => {
    const senderId = toObjectId(req.userId);
    const receiverId = toObjectId(req.body.receiverId);
    const text = sanitizePlainText(req.body.text, 1000);

    if (!senderId || !receiverId) {
        return res.status(400).json({
            success: false,
            message: 'Invalid sender or receiver',
        });
    }

    if (senderId.toString() === receiverId.toString()) {
        return res.status(400).json({
            success: false,
            message: 'You cannot message yourself',
        });
    }

    if (!text) {
        return res.status(400).json({
            success: false,
            message: 'Message cannot be empty',
        });
    }

    const usersCollection = getCollection('users');
    const receiver = await usersCollection.findOne({ _id: receiverId });

    if (!receiver) {
        return res.status(404).json({
            success: false,
            message: 'Receiver not found',
        });
    }

    const message = {
        conversationKey: getConversationKey(senderId, receiverId),
        senderId,
        receiverId,
        text,
        readAt: null,
        createdAt: new Date(),
    };

    const result = await getCollection('messages').insertOne(message);

    await createNotification({
        userId: receiverId,
        actorUserId: senderId,
        type: 'message',
        entityType: 'message',
        entityId: result.insertedId,
        text: 'sent you a message',
    });

    res.status(201).json({
        success: true,
        message: {
            id: result.insertedId.toString(),
            senderId: senderId.toString(),
            receiverId: receiverId.toString(),
            text,
            readAt: null,
            createdAt: message.createdAt,
        },
    });
});

exports.getMessages = asyncHandler(async (req, res) => {
    const currentUserId = toObjectId(req.userId);
    const otherUserId = toObjectId(req.params.userId);

    if (!currentUserId || !otherUserId) {
        return res.status(400).json({
            success: false,
            message: 'Invalid user id',
        });
    }

    const conversationKey = getConversationKey(currentUserId, otherUserId);
    const messagesCollection = getCollection('messages');

    await messagesCollection.updateMany(
        {
            conversationKey,
            receiverId: currentUserId,
            readAt: null,
        },
        {
            $set: { readAt: new Date() },
        }
    );

    const messages = await messagesCollection
        .find({ conversationKey })
        .sort({ createdAt: 1 })
        .limit(200)
        .toArray();

    res.json({
        success: true,
        messages: messages.map((message) => ({
            id: message._id.toString(),
            senderId: message.senderId.toString(),
            receiverId: message.receiverId.toString(),
            text: message.text,
            readAt: message.readAt,
            createdAt: message.createdAt,
        })),
    });
});

exports.getConversations = asyncHandler(async (req, res) => {
    const currentUserId = toObjectId(req.userId);

    if (!currentUserId) {
        return res.status(401).json({
            success: false,
            message: 'Authentication required',
        });
    }

    const conversations = await getCollection('messages')
        .aggregate([
            {
                $match: {
                    $or: [{ senderId: currentUserId }, { receiverId: currentUserId }],
                },
            },
            {
                $sort: { createdAt: -1 },
            },
            {
                $addFields: {
                    otherUserId: {
                        $cond: [{ $eq: ['$senderId', currentUserId] }, '$receiverId', '$senderId'],
                    },
                },
            },
            {
                $group: {
                    _id: '$otherUserId',
                    lastMessage: { $first: '$$ROOT' },
                    unreadCount: {
                        $sum: {
                            $cond: [
                                {
                                    $and: [
                                        { $eq: ['$receiverId', currentUserId] },
                                        { $eq: ['$readAt', null] },
                                    ],
                                },
                                1,
                                0,
                            ],
                        },
                    },
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
            {
                $sort: { 'lastMessage.createdAt': -1 },
            },
        ])
        .toArray();

    res.json({
        success: true,
        conversations: conversations.map((conversation) => ({
            user: serializeUserSummary(conversation.user),
            unreadCount: conversation.unreadCount,
            lastMessage: {
                id: conversation.lastMessage._id.toString(),
                senderId: conversation.lastMessage.senderId.toString(),
                receiverId: conversation.lastMessage.receiverId.toString(),
                text: conversation.lastMessage.text,
                readAt: conversation.lastMessage.readAt,
                createdAt: conversation.lastMessage.createdAt,
            },
        })),
    });
});
