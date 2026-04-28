const { getCollection } = require('../utils/database');
const asyncHandler = require('../utils/asyncHandler');
const { getUserMap, serializeUserSummary } = require('../utils/serializers');
const { toObjectId } = require('../utils/text');

exports.getNotifications = asyncHandler(async (req, res) => {
    const userId = toObjectId(req.userId);
    const limit = Math.min(50, Math.max(1, Number.parseInt(req.query.limit, 10) || 30));

    if (!userId) {
        return res.status(401).json({
            success: false,
            message: 'Authentication required',
        });
    }

    const notifications = await getCollection('notifications')
        .find({ userId })
        .sort({ createdAt: -1 })
        .limit(limit)
        .toArray();
    const actorMap = await getUserMap(notifications.map((item) => item.actorUserId));

    res.json({
        success: true,
        notifications: notifications.map((notification) => ({
            id: notification._id.toString(),
            type: notification.type,
            entityType: notification.entityType,
            entityId: notification.entityId ? notification.entityId.toString() : null,
            text: notification.text,
            createdAt: notification.createdAt,
            readAt: notification.readAt,
            actor: serializeUserSummary(actorMap.get(notification.actorUserId.toString())),
        })),
    });
});

exports.markAsRead = asyncHandler(async (req, res) => {
    const userId = toObjectId(req.userId);
    const notificationId = toObjectId(req.params.notificationId);

    if (!userId || !notificationId) {
        return res.status(400).json({
            success: false,
            message: 'Invalid notification id',
        });
    }

    await getCollection('notifications').updateOne(
        { _id: notificationId, userId },
        {
            $set: { readAt: new Date() },
        }
    );

    res.json({
        success: true,
        message: 'Notification marked as read',
    });
});

exports.markAllAsRead = asyncHandler(async (req, res) => {
    const userId = toObjectId(req.userId);

    if (!userId) {
        return res.status(401).json({
            success: false,
            message: 'Authentication required',
        });
    }

    await getCollection('notifications').updateMany(
        {
            userId,
            readAt: null,
        },
        {
            $set: { readAt: new Date() },
        }
    );

    res.json({
        success: true,
        message: 'Notifications marked as read',
    });
});

exports.deleteNotification = asyncHandler(async (req, res) => {
    const userId = toObjectId(req.userId);
    const notificationId = toObjectId(req.params.notificationId);

    if (!userId || !notificationId) {
        return res.status(400).json({
            success: false,
            message: 'Invalid notification id',
        });
    }

    await getCollection('notifications').deleteOne({
        _id: notificationId,
        userId,
    });

    res.json({
        success: true,
        message: 'Notification deleted',
    });
});
