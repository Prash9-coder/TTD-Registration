require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const path = require('path');

// Import routes
const teamRoutes = require('./routes/teams');
const uploadRoutes = require('./routes/upload');
const verificationRoutes = require('./routes/verification');

const app = express();

// Allowed origins for CORS
const allowedOrigins = [
    'http://localhost:3000',
    'http://localhost:3001',
    process.env.FRONTEND_URL,
    'https://ttdregistration.vercel.app' // Update after deployment
].filter(Boolean);

// Security Middleware
app.use(
    helmet({
        contentSecurityPolicy: false, // Disable for API server
        crossOriginEmbedderPolicy: false,
        crossOriginResourcePolicy: { policy: "cross-origin" }
    })
);

// CORS Configuration
app.use(cors({
    origin: function (origin, callback) {
        // Allow requests with no origin (mobile apps, Postman, etc.)
        if (!origin) return callback(null, true);

        if (allowedOrigins.indexOf(origin) !== -1 || process.env.NODE_ENV === 'development') {
            callback(null, true);
        } else {
            console.log('CORS blocked origin:', origin);
            callback(null, true); // Allow all for now, can restrict later
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Compression and logging
app.use(compression());
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// Serve static files (uploads directory)
app.use('/uploads', express.static(path.join(__dirname, 'uploads'), {
    maxAge: '1d', // Cache for 1 day
    setHeaders: (res, filePath) => {
        res.set('Cross-Origin-Resource-Policy', 'cross-origin');
        res.set('Access-Control-Allow-Origin', '*');
    }
}));

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI)
    .then(() => {
        console.log('✅ MongoDB Connected Successfully');
        console.log(`📊 Database: ${mongoose.connection.name}`);
    })
    .catch((err) => {
        console.error('❌ MongoDB Connection Error:', err);
        process.exit(1);
    });

// API Routes
app.use('/api/teams', teamRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/verification', verificationRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({
        status: 'OK',
        message: 'Server is running',
        timestamp: new Date().toISOString(),
        mongodb: mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected',
        environment: process.env.NODE_ENV || 'development',
        version: '1.0.0'
    });
});

// Root endpoint - API info
app.get('/', (req, res) => {
    res.json({
        message: 'TTD Registration API',
        version: '1.0.0',
        status: 'active',
        endpoints: {
            health: '/api/health',
            teams: '/api/teams',
            upload: '/api/upload/photo',
            verification: '/api/verification'
        },
        documentation: 'https://github.com/YOUR-USERNAME/ttdbackend'
    });
});

// 404 Handler - Must be after all routes
app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: 'Endpoint not found',
        path: req.path,
        method: req.method,
        availableEndpoints: [
            'GET /',
            'GET /api/health',
            'GET /api/teams',
            'POST /api/teams',
            'GET /api/teams/:id',
            'PUT /api/teams/:id/verify',
            'DELETE /api/teams/:id',
            'POST /api/upload/photo'
        ]
    });
});

// Global Error Handler
app.use((err, req, res, next) => {
    console.error('❌ Error:', err);

    res.status(err.status || 500).json({
        success: false,
        message: err.message || 'Internal Server Error',
        ...(process.env.NODE_ENV === 'development' && {
            stack: err.stack,
            error: err
        })
    });
});

// Start Server
const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, '0.0.0.0', () => {
    console.log('='.repeat(50));
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📝 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🌐 CORS enabled for:`, allowedOrigins);
    console.log(`📧 Email configured: ${process.env.SMTP_USER ? 'Yes' : 'No'}`);
    console.log('='.repeat(50));
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM signal received: closing HTTP server');
    server.close(() => {
        console.log('HTTP server closed');
        mongoose.connection.close(false, () => {
            console.log('MongoDB connection closed');
            process.exit(0);
        });
    });
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
    console.error('❌ Unhandled Promise Rejection:', err);
    // Close server & exit process
    server.close(() => {
        process.exit(1);
    });
});

// Disable x-powered-by header
app.disable('x-powered-by');

module.exports = app;