/**
 * MongoDB Native Driver Connection
 * Handles all database connection and operations
 */

const { MongoClient, ServerApiVersion } = require('mongodb');

let client;
let db;

/**
 * Connect to MongoDB
 */
async function connectDB() {
    try {
        client = new MongoClient(process.env.MONGODB_URI, {
            serverApi: {
                version: ServerApiVersion.v1,
                strict: true,
                deprecationErrors: true,
            },
        });

        // Connect to the MongoDB cluster
        await client.connect();

        // Select database
        db = client.db('instaJOY');

        // Verify connection
        await db.admin().ping();

        console.log('✓ MongoDB Connected Successfully');

        // Create indexes for performance
        await createIndexes();

        return db;
    } catch (error) {
        console.error('✗ MongoDB Connection Failed:', error.message);
        throw error;
    }
}

/**
 * Create database indexes
 */
async function createIndexes() {
    try {
        const usersCollection = db.collection('users');
        const postsCollection = db.collection('posts');
        const reelsCollection = db.collection('reels');
        const messagesCollection = db.collection('messages');
        const notificationsCollection = db.collection('notifications');

        // Users indexes
        await usersCollection.createIndex({ username: 1 }, { unique: true });
        await usersCollection.createIndex({ email: 1 }, { unique: true });
        await usersCollection.createIndex({ createdAt: -1 });

        // Posts indexes
        await postsCollection.createIndex({ authorId: 1 });
        await postsCollection.createIndex({ createdAt: -1 });
        await postsCollection.createIndex({ likes: 1 });
        await postsCollection.createIndex({ caption: 'text' });

        // Reels indexes
        await reelsCollection.createIndex({ authorId: 1 });
        await reelsCollection.createIndex({ createdAt: -1 });
        await reelsCollection.createIndex({ likes: 1 });

        // Messages indexes
        await messagesCollection.createIndex({ senderId: 1, receiverId: 1 });
        await messagesCollection.createIndex({ createdAt: -1 });

        // Notifications indexes
        await notificationsCollection.createIndex({ userId: 1 });
        await notificationsCollection.createIndex({ createdAt: -1 });
        await notificationsCollection.createIndex({ read: 1 });

        console.log('✓ Database indexes created');
    } catch (error) {
        console.error('Error creating indexes:', error.message);
    }
}

/**
 * Get database instance
 */
function getDB() {
    if (!db) {
        throw new Error('Database not connected. Call connectDB first.');
    }
    return db;
}

/**
 * Get a collection
 */
function getCollection(name) {
    const database = getDB();
    return database.collection(name);
}

/**
 * Close database connection
 */
async function closeDB() {
    if (client) {
        await client.close();
        console.log('✓ Database connection closed');
    }
}

module.exports = {
    connectDB,
    getDB,
    getCollection,
    closeDB,
};
