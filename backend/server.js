const fs = require('fs');
const path = require('path');

const dotenv = require('dotenv');

[
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), 'backend/.env'),
].some((candidate) => {
    if (fs.existsSync(candidate)) {
        dotenv.config({ path: candidate });
        return true;
    }

    return false;
});

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const { connectDB, closeDB } = require('./utils/database');
const errorHandler = require('./middleware/errorHandler');

const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const postRoutes = require('./routes/postRoutes');
const reelRoutes = require('./routes/reelRoutes');
const messageRoutes = require('./routes/messageRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const searchRoutes = require('./routes/searchRoutes');
const followRoutes = require('./routes/followRoutes');
const { authLimiter } = require('./middleware/rateLimiters');

function requireEnv(name) {
    if (!process.env[name]) {
        throw new Error(`${name} is required`);
    }
}

function normalizeOrigin(value) {
    const normalized = String(value || '').trim();

    if (!normalized) {
        return '';
    }

    try {
        if (/^https?:\/\//i.test(normalized)) {
            return new URL(normalized).origin;
        }
    } catch (_) {
        return normalized.replace(/\/+$/, '');
    }

    return normalized.replace(/\/+$/, '');
}

function getAllowedOrigins() {
    const configuredOrigins = [
        process.env.FRONTEND_URL,
        ...(process.env.FRONTEND_URLS || '').split(','),
    ]
        .map(normalizeOrigin)
        .filter(Boolean);

    if (process.env.NODE_ENV !== 'production') {
        configuredOrigins.push(
            'http://127.0.0.1:5500',
            'http://localhost:5500',
            'http://127.0.0.1:4173',
            'http://localhost:4173',
            'http://127.0.0.1:3000',
            'http://localhost:3000',
            // Allow local server origin used during development and testing
            'http://127.0.0.1:5000',
            'http://localhost:5000'
        );
    }

    return [...new Set(configuredOrigins)];
}

const allowedOrigins = getAllowedOrigins();
const app = express();
app.set('trust proxy', 1);

app.use(
    helmet({
        crossOriginResourcePolicy: false,
        contentSecurityPolicy: false,
    })
);

app.use(
    cors({
        origin(origin, callback) {
            if (!origin) {
                return callback(null, true);
            }

            if (allowedOrigins.includes(origin)) {
                return callback(null, true);
            }

            return callback(new Error('Origin not allowed by CORS'));
        },
        methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization'],
    })
);

app.use(express.json({ limit: '3mb' }));
app.use(express.urlencoded({ extended: true, limit: '3mb' }));

// Serve static root files (index.html, ilogo.png, etc)
app.use(express.static(path.join(__dirname, '..')));

// Serve frontend subdirectory
app.use('/frontend', express.static(path.join(__dirname, '..', 'frontend')));

// Serve index.html for root  
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'index.html'));
});

const generalLimiter = rateLimit({
    windowMs: Number.parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 15 * 60 * 1000,
    max: Number.parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10) || 150,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        message: 'Too many requests, please try again later.',
    },
});

app.get('/api/health', async (req, res) => {
    res.json({
        success: true,
        status: 'ok',
        timestamp: new Date().toISOString(),
    });
});

// Add a health check endpoint for MongoDB connectivity
app.get('/api/db-health', async (req, res) => {
    try {
        const db = await connectDB();
        await db.command({ ping: 1 });
        res.json({ success: true, message: 'MongoDB is connected' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'MongoDB connection failed', error: error.message });
    }
});

app.use('/api', generalLimiter);
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/posts', postRoutes);
app.use('/api/reels', reelRoutes);
app.use('/api/users', userRoutes);
app.use('/api/follows', followRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/search', searchRoutes);

app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: 'Route not found',
    });
});

app.use(errorHandler);

const PORT = Number.parseInt(process.env.PORT, 10) || 3000;
let server = null;

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function connectWithRetry(attempts = 5, delayMs = 3000) {
    let lastError = null;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
        try {
            await connectDB();
            console.log('MongoDB connected successfully');
            return;
        } catch (error) {
            lastError = error;
            console.warn(`MongoDB connection attempt ${attempt} of ${attempts} failed: ${error.message}`);
            if (attempt < attempts) {
                await sleep(delayMs);
            }
        }
    }

    throw lastError;
}

async function startServer() {
    requireEnv('MONGODB_URI');
    requireEnv('JWT_SECRET');
    requireEnv('JWT_REFRESH_SECRET');

    try {
        await connectWithRetry();
    } catch (error) {
        console.error('Failed to connect to MongoDB after retries:', error.message);
    }

    server = app.listen(PORT, '0.0.0.0', () => {
        console.log(`Server running on PORT ${PORT}`);
    });
}

async function shutdown(signal) {
    if (signal) {
        console.log(`${signal} received, shutting down`);
    }

    if (server) {
        await new Promise((resolve) => server.close(resolve));
        server = null;
    }

    await closeDB();
}

if (require.main === module) {
    process.on('unhandledRejection', (reason) => {
        console.error('Unhandled promise rejection:', reason);
    });

    process.on('uncaughtException', async (error) => {
        console.error('Uncaught exception:', error);
        await shutdown('uncaughtException');
        process.exit(1);
    });

    startServer().catch(async (error) => {
        console.error('Failed to start server:', error.message);
        await shutdown();
        process.exit(1);
    });

    ['SIGINT', 'SIGTERM'].forEach((signal) => {
        process.on(signal, async () => {
            await shutdown(signal);
            process.exit(0);
        });
    });
}

module.exports = {
    app,
    getAllowedOrigins,
    normalizeOrigin,
    shutdown,
    startServer,
};
