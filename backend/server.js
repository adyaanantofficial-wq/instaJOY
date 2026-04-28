/**
 * instaJOY Backend Server
 * Express.js + MongoDB Native Driver
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { connectDB } = require('./utils/database');

// Import routes
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const postRoutes = require('./routes/postRoutes');
const reelRoutes = require('./routes/reelRoutes');
const messageRoutes = require('./routes/messageRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const searchRoutes = require('./routes/searchRoutes');
const followRoutes = require('./routes/followRoutes');

// Import middleware
const errorHandler = require('./middleware/errorHandler');

// Initialize Express
const app = express();

// MongoDB connection instance
let db;

// =====================
// Security Middleware
// =====================

// Helmet for security headers
app.use(helmet());

// CORS configuration
app.use(
    cors({
        origin: process.env.FRONTEND_URL || '*',
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
        credentials: true,
        optionsSuccessStatus: 200,
    })
);

// Rate limiting
const limiter = rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
    message: 'Too many requests from this IP, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
});

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // 5 attempts per window
    message: 'Too many login attempts, please try again later.',
    skip: (req) => req.method !== 'POST',
});

app.use('/api/', limiter);
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);

// Body parser
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// =====================
// Health Check
// =====================

app.get('/api/health', (req, res) => {
    res.json({
        status: 'OK',
        message: 'instaJOY Backend is running',
        timestamp: new Date().toISOString(),
    });
});

// =====================
// API Routes
// =====================

app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);
app.use('/api/posts', postRoutes);
app.use('/api/reels', reelRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/follow', followRoutes);

// =====================
// 404 Handler
// =====================

app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: 'Route not found',
    });
});

// =====================
// Error Handler (Must be last)
// =====================

app.use(errorHandler);

// =====================
// Start Server
// =====================

const PORT = process.env.PORT || 5000;

async function startServer() {
    try {
        // Connect to MongoDB
        await connectDB();
        db = require('./utils/database').getDB();

        // Attach db to app for middleware use
        app.locals.db = db;

        const server = app.listen(PORT, () => {
            console.log(`
╔════════════════════════════════╗
║     instaJOY Backend Server    ║
╚════════════════════════════════╝

Port: ${PORT}
Environment: ${process.env.NODE_ENV || 'development'}
Database: Connected ✓

API Endpoints:
  ─── Authentication ───
  POST   /api/auth/register
  POST   /api/auth/login
  POST   /api/auth/logout
  POST   /api/auth/refresh
  GET    /api/auth/me
  
  ─── Users ───
  GET    /api/user/:username
  GET    /api/user/:userId/profile
  POST   /api/user/profile/update
  POST   /api/user/profile/avatar
  GET    /api/user/suggested
  
  ─── Follow System ───
  POST   /api/follow/:userId
  POST   /api/unfollow/:userId
  GET    /api/follower/:userId
  GET    /api/following/:userId
  
  ─── Posts ───
  POST   /api/posts/create
  GET    /api/posts/feed
  GET    /api/posts/user/:userId
  GET    /api/posts/:postId
  DELETE /api/posts/:postId
  POST   /api/posts/:postId/like
  POST   /api/posts/:postId/unlike
  POST   /api/posts/:postId/comment
  DELETE /api/posts/:postId/comment/:commentId
  
  ─── Reels ───
  POST   /api/reels/create
  GET    /api/reels/feed
  POST   /api/reels/:reelId/like
  POST   /api/reels/:reelId/unlike
  POST   /api/reels/:reelId/comment
  
  ─── Messages ───
  POST   /api/messages/send
  GET    /api/messages/:userId
  GET    /api/messages/list
  DELETE /api/messages/:messageId
  
  ─── Notifications ───
  GET    /api/notifications
  POST   /api/notifications/:notificationId/read
  DELETE /api/notifications/:notificationId
  
  ─── Search ───
  GET    /api/search/users?q=query
  GET    /api/search/posts?q=query
  
  ─── Health ───
  GET    /api/health

Ready for requests! 🚀
            `);

        // Graceful shutdown
        process.on('SIGTERM', () => {
            console.log('SIGTERM signal received: closing HTTP server');
            server.close(async () => {
                await require('./utils/database').closeDB();
                process.exit(0);
            });
        });

    } catch (error) {
        console.error('✗ Failed to start server:', error.message);
        if (process.env.NODE_ENV === 'production') {
            process.exit(1);
        }
    }
}

startServer();

module.exports = app;
