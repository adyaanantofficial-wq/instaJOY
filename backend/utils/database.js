const { MongoClient, ServerApiVersion } = require('mongodb');

let client = null;
let db = null;

async function createIndexes(database) {
    await Promise.all([
        database.collection('users').createIndexes([
            { key: { username: 1 }, unique: true },
            { key: { email: 1 }, unique: true },
            { key: { createdAt: -1 } },
        ]),
        database.collection('posts').createIndexes([
            { key: { userId: 1 } },
            { key: { createdAt: -1 } },
            { key: { type: 1, createdAt: -1 } },
        ]),
        database.collection('reels').createIndexes([
            { key: { userId: 1 } },
            { key: { createdAt: -1 } },
        ]),
        database.collection('likes').createIndexes([
            { key: { userId: 1, createdAt: -1 } },
            { key: { targetType: 1, targetId: 1, createdAt: -1 } },
            { key: { userId: 1, targetType: 1, targetId: 1 }, unique: true },
        ]),
        database.collection('comments').createIndexes([
            { key: { userId: 1, createdAt: -1 } },
            { key: { targetType: 1, targetId: 1, createdAt: -1 } },
        ]),
        database.collection('messages').createIndexes([
            { key: { conversationKey: 1, createdAt: -1 } },
            { key: { senderId: 1, createdAt: -1 } },
            { key: { receiverId: 1, createdAt: -1 } },
        ]),
        database.collection('notifications').createIndexes([
            { key: { userId: 1, createdAt: -1 } },
            { key: { readAt: 1 } },
        ]),
        database.collection('follows').createIndexes([
            { key: { followerId: 1, followingId: 1 }, unique: true },
            { key: { followingId: 1, createdAt: -1 } },
            { key: { followerId: 1, createdAt: -1 } },
        ]),
    ]);
}

async function connectDB() {
    if (db) {
        return db;
    }

    if (!process.env.MONGODB_URI) {
        throw new Error('MONGODB_URI is required');
    }

    client = new MongoClient(process.env.MONGODB_URI, {
        serverApi: {
            version: ServerApiVersion.v1,
            strict: true,
            deprecationErrors: true,
        },
    });

    try {
        await client.connect();
        db = process.env.MONGODB_DB ? client.db(process.env.MONGODB_DB) : client.db();
        await db.command({ ping: 1 });
        await createIndexes(db);
    } catch (error) {
        if (client) {
            await client.close().catch(() => {});
            client = null;
            db = null;
        }

        if (String(error.message || '').includes('querySrv')) {
            error.message =
                'Could not resolve the MongoDB Atlas SRV host. Check the MONGODB_URI host, local DNS/network access, or use a working Atlas connection string.';
        }

        throw error;
    }

    return db;
}

function getDB() {
    if (!db) {
        throw new Error('Database not connected');
    }

    return db;
}

function getCollection(name) {
    return getDB().collection(name);
}

async function closeDB() {
    if (client) {
        await client.close();
        client = null;
        db = null;
    }
}

module.exports = {
    closeDB,
    connectDB,
    getCollection,
    getDB,
};
