require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

const app = express();

// ===================================
// TRUST PROXY - CRITICAL FOR RENDER!
// ===================================
app.set('trust proxy', 1); // Trust first proxy (Render)

// ===================================
// CORS - Allow All Origins
// ===================================
app.use(cors({
    origin: '*',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

app.options('*', cors());

// ===================================
// MIDDLEWARE
// ===================================
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging middleware
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
});

// Static files
app.use('/uploads', express.static(path.join(__dirname, 'uploads'), {
    setHeaders: (res) => {
        res.set('Cross-Origin-Resource-Policy', 'cross-origin');
        res.set('Access-Control-Allow-Origin', '*');
    }
}));

// ===================================
// MONGODB CONNECTION
// ===================================
mongoose.connect(process.env.MONGODB_URI)
    .then(() => {
        console.log('✅ MongoDB Connected Successfully');
        console.log(`📊 Database: ${mongoose.connection.name}`);
    })
    .catch((err) => {
        console.error('❌ MongoDB Connection Error:', err);
        process.exit(1);
    });

// ===================================
// ROUTES
// ===================================
app.use('/api/teams', require('./routes/teams'));
app.use('/api/upload', require('./routes/upload'));
app.use('/api/verification', require('./routes/verification'));

// ===================================
// BASIC ENDPOINTS
// ===================================

// Health check
app.get('/api/health', (req, res) => {
    res.json({
        status: 'OK',
        message: 'Server is running',
        timestamp: new Date().toISOString(),
        mongodb: mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected',
        environment: process.env.NODE_ENV || 'development',
        emailConfigured: !!process.env.SMTP_USER
    });
});

// Root
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
        }
    });
});

// ===================================
// ERROR HANDLERS
// ===================================

// 404 Handler
app.use((req, res) => {
    console.log(`404 - Route not found: ${req.method} ${req.path}`);
    res.status(404).json({
        success: false,
        message: 'Route not found',
        path: req.path,
        method: req.method
    });
});

// Global Error Handler
app.use((err, req, res, next) => {
    console.error('❌ Error:', err.message);
    console.error('Stack:', err.stack);

    res.status(err.status || 500).json({
        success: false,
        message: err.message || 'Internal Server Error'
    });
});

// ===================================
// START SERVER
// ===================================
const PORT = process.env.PORT || 5000;

const server = app.listen(PORT, '0.0.0.0', () => {
    console.log('='.repeat(50));
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📝 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🌐 CORS: Enabled for ALL origins`);
    console.log(`📧 Email: ${process.env.SMTP_USER ? 'Configured ✅' : 'Not configured ❌'}`);
    console.log('='.repeat(50));
});

// ===================================
// GRACEFUL SHUTDOWN - FIXED
// ===================================
process.on('SIGTERM', async () => {
    console.log('SIGTERM signal received: closing HTTP server');
    server.close(() => {
        console.log('HTTP server closed');
    });

    try {
        await mongoose.connection.close(); // No callback needed
        console.log('MongoDB connection closed');
        process.exit(0);
    } catch (err) {
        console.error('Error closing MongoDB:', err);
        process.exit(1);
    }
});

// Handle unhandled rejections
process.on('unhandledRejection', (err) => {
    console.error('❌ Unhandled Promise Rejection:', err);
    server.close(() => {
        process.exit(1);
    });
});

module.exports = app;