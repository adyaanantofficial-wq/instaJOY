const { getCollection } = require('./database');

async function createNotification({ userId, actorUserId, type, entityType, entityId, text }) {
    if (!userId || !actorUserId || userId.toString() === actorUserId.toString()) {
        return;
    }

    await getCollection('notifications').insertOne({
        userId,
        actorUserId,
        type,
        entityType: entityType || null,
        entityId: entityId || null,
        text: text || '',
        readAt: null,
        createdAt: new Date(),
    });
}

module.exports = {
    createNotification,
};
