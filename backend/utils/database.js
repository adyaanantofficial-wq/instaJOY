const { MongoClient, ServerApiVersion } = require('mongodb');
const dns = require('dns');

let client = null;
let db = null;

function getMongoHostHint(uri) {
    try {
        const parsed = new URL(uri);
        return parsed.host || 'the configured MongoDB host';
    } catch (_) {
        return 'the configured MongoDB host';
    }
}

function rewriteMongoConnectionError(error, uri) {
    const message = String(error.message || '');
    const hostHint = getMongoHostHint(uri);
    const isSrvUri = String(uri || '').startsWith('mongodb+srv://');

    if (
        message.includes('querySrv') ||
        message.includes('ENOTFOUND') ||
        message.includes('EAI_AGAIN')
    ) {
        error.message = isSrvUri
            ? `Could not resolve the MongoDB Atlas SRV host for ${hostHint}. Check DNS/network access or switch MONGODB_URI to Atlas's standard connection string instead of the SRV form.`
            : `Could not resolve ${hostHint}. Check the MONGODB_URI host and network/DNS access from the deployment environment.`;
        return;
    }

    if (
        message.includes('tlsv1 alert internal error') ||
        message.includes('SSL alert number 80') ||
        error.code === 'ERR_SSL_TLSV1_ALERT_INTERNAL_ERROR'
    ) {
        error.message =
            `MongoDB TLS handshake failed while connecting to ${hostHint}. ` +
            `Verify the Atlas cluster is available, Atlas Network Access allows this deployment, ` +
            `and if you are using an SRV URI try Atlas's standard connection string in MONGODB_URI.`;
    }
}

const fallbackDnsServers = ['8.8.8.8', '1.1.1.1'];

async function resolveSrvRecords(hostname) {
    const resolver = new dns.promises.Resolver();
    resolver.setServers(fallbackDnsServers);
    return resolver.resolveSrv(`_mongodb._tcp.${hostname}`);
}

function buildStandardMongoUri(srvUri, srvRecords) {
    const parsed = new URL(srvUri);
    const auth = parsed.username
        ? `${encodeURIComponent(parsed.username)}:${encodeURIComponent(parsed.password)}@`
        : '';
    const pathname = parsed.pathname || '/';
    const searchParams = new URLSearchParams(parsed.searchParams);

    if (!searchParams.has('tls') && !searchParams.has('ssl')) {
        searchParams.set('tls', 'true');
    }

    if (parsed.username && !searchParams.has('authSource')) {
        searchParams.set('authSource', 'admin');
    }

    const hostList = srvRecords
        .map((record) => `${record.name}:${record.port}`)
        .join(',');

    return `mongodb://${auth}${hostList}${pathname}?${searchParams.toString()}`;
}

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

    // Securely read the connection string from environment variables
    const uri = process.env.MONGODB_URI;
    if (!uri) {
        throw new Error('MONGODB_URI is required');
    }

    async function attemptConnect(uri) {
        client = new MongoClient(uri, {
            connectTimeoutMS: 15000,
            serverSelectionTimeoutMS: 15000,
            socketTimeoutMS: 15000,
            family: 4,
            serverApi: {
                version: ServerApiVersion.v1,
                strict: false,
                deprecationErrors: true,
            },
            tls: true,
            retryWrites: true,
        });

        await client.connect();
        db = process.env.MONGODB_DB ? client.db(process.env.MONGODB_DB) : client.db();
        await db.command({ ping: 1 });
        await createIndexes(db);
    }

    try {
        await attemptConnect(uri);
    } catch (error) {
        if (client) {
            await client.close().catch(() => {});
            client = null;
            db = null;
        }

        const originalUri = uri;
        const message = String(error.message || '');
        const isSrvUri = originalUri.startsWith('mongodb+srv://');

        if (
            isSrvUri &&
            (message.includes('querySrv') || message.includes('ENOTFOUND') || message.includes('ECONNREFUSED'))
        ) {
            try {
                const parsed = new URL(originalUri);
                const srvHost = parsed.hostname;
                const srvRecords = await resolveSrvRecords(srvHost);
                const fallbackUri = buildStandardMongoUri(originalUri, srvRecords);

                await attemptConnect(fallbackUri);
                return db;
            } catch (fallbackError) {
                if (client) {
                    await client.close().catch(() => {});
                    client = null;
                    db = null;
                }

                rewriteMongoConnectionError(fallbackError, originalUri);
                throw fallbackError;
            }
        }

        rewriteMongoConnectionError(error, originalUri);
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
