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

// Middleware
app.use(
    helmet({
        contentSecurityPolicy: {
            useDefaults: true,
            directives: {
                "default-src": ["'self'"],
                "script-src": [
                    "'self'",
                    "'unsafe-inline'",
                    "https://cdn.tailwindcss.com"
                ],
                "script-src-attr": [
                    "'self'",
                    "'unsafe-inline'"
                ],
                "style-src": [
                    "'self'",
                    "'unsafe-inline'",
                    "https://cdn.tailwindcss.com"
                ],
                "font-src": [
                    "'self'",
                    "data:",
                    "https://fonts.gstatic.com"
                ],
                "img-src": ["'self'", "data:", "blob:"],
                "connect-src": ["'self'", "*"],
                "frame-src": ["'self'"],
                "object-src": ["'none'"],
                "base-uri": ["'self'"]
            }
        },
        crossOriginEmbedderPolicy: false,
        crossOriginResourcePolicy: false
    })
);

// Security headers
app.use(cors({
    origin: ['http://localhost:3000', 'http://localhost:3001'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(compression()); // Compress responses
app.use(morgan('dev')); // Logging
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve static files (uploads directory)
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

app.use('/lib', express.static(__dirname + '/public/lib', {
    setHeaders: (res) => {
        res.set('Content-Type', 'application/javascript');
    }
}));


// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('✅ MongoDB Connected Successfully'))
    .catch((err) => {
        console.error('❌ MongoDB Connection Error:', err);
        process.exit(1);
    });

// Routes
app.use('/api/teams', teamRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/verification', verificationRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        mongodb: mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected',
        environment: process.env.NODE_ENV
    });
});

// Serve frontend pages
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '/public/index.html'));
});

app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, '/public/admin.html'));
});

// 404 Handler
app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: 'Endpoint not found'
    });
});

// Global Error Handler
app.use((err, req, res, next) => {
    console.error('Error:', err);

    res.status(err.status || 500).json({
        success: false,
        message: err.message || 'Internal Server Error',
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
});

// Start Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📝 Environment: ${process.env.NODE_ENV}`);
    console.log(`🌐 CORS enabled for: ${process.env.CORS_ORIGIN}`);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
    console.error('Unhandled Promise Rejection:', err);
    // Close server & exit process
    process.exit(1);
});

app.disable('x-powered-by');
