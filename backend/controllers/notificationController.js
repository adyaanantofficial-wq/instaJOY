/**
 * Notification Controller
 */

const { ObjectId } = require('mongodb');
const { getCollection } = require('../utils/database');

exports.getNotifications = async (req, res, next) => {
    try {
        const userId = req.userId;
        const limit = parseInt(req.query.limit) || 20;

        const notificationsCollection = getCollection('notifications');

        const notifications = await notificationsCollection
            .find({ userId: new ObjectId(userId) })
            .sort({ createdAt: -1 })
            .limit(limit)
            .toArray();

        res.json({ success: true, notifications });
    } catch (error) {
        next(error);
    }
};

exports.markAsRead = async (req, res, next) => {
    try {
        const { notificationId } = req.params;

        const notificationsCollection = getCollection('notifications');

        await notificationsCollection.updateOne(
            { _id: new ObjectId(notificationId) },
            { $set: { read: true } }
        );

        res.json({ success: true, message: 'Notification marked as read' });
    } catch (error) {
        next(error);
    }
};

exports.deleteNotification = async (req, res, next) => {
    try {
        const { notificationId } = req.params;

        const notificationsCollection = getCollection('notifications');

        await notificationsCollection.deleteOne({ _id: new ObjectId(notificationId) });

        res.json({ success: true, message: 'Notification deleted' });
    } catch (error) {
        next(error);
    }
};
