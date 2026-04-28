/**
 * instaJOY Backend Server
 * Express.js + MongoDB
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const mongoose = require('mongoose');

// Import routes
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const postRoutes = require('./routes/postRoutes');

// Import middleware
const errorHandler = require('./middleware/errorHandler');

// Initialize Express
const app = express();

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
// Database Connection
// =====================

async function connectDatabase() {
    try {
        const conn = await mongoose.connect(process.env.MONGODB_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });

        console.log(`✓ MongoDB Connected: ${conn.connection.host}`);
        return true;
    } catch (error) {
        console.error('✗ MongoDB Connection Failed:', error.message);
        return false;
    }
}

// =====================
// Start Server
// =====================

const PORT = process.env.PORT || 5000;

async function startServer() {
    const dbConnected = await connectDatabase();

    if (!dbConnected && process.env.NODE_ENV === 'production') {
        console.error('Cannot start server without database connection');
        process.exit(1);
    }

    app.listen(PORT, () => {
        console.log(`
╔════════════════════════════════╗
║     instaJOY Backend Server    ║
╚════════════════════════════════╝

Port: ${PORT}
Environment: ${process.env.NODE_ENV || 'development'}
Database: ${dbConnected ? 'Connected ✓' : 'Not Connected ✗'}

API Endpoints:
  POST   /api/auth/register
  POST   /api/auth/login
  POST   /api/auth/refresh
  GET    /api/auth/me
  
  GET    /api/user/:username
  POST   /api/user/profile/update
  POST   /api/user/follow
  POST   /api/user/unfollow
  GET    /api/user/suggested
  
  POST   /api/posts/create
  GET    /api/posts/feed
  GET    /api/posts/user/:username
  DELETE /api/posts/:postId
  POST   /api/posts/:postId/like
  POST   /api/posts/:postId/unlike
  GET    /api/posts/:postId/comments
  POST   /api/posts/:postId/comment
  DELETE /api/posts/:postId/comment/:commentId

Health Check:
  GET    /api/health

Ready for requests! 🚀
        `);
    });
}

startServer();

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM signal received: closing HTTP server');
    process.exit(0);
});

module.exports = app;
