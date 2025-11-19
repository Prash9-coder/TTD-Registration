require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

const app = express();

// ===================================
// CORS - SIMPLE & WORKING
// ===================================
app.use(cors({
    origin: '*', // Allow ALL origins (we'll restrict later)
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// Preflight requests
app.options('*', cors());

// ===================================
// MIDDLEWARE
// ===================================
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static files
app.use('/uploads', express.static(path.join(__dirname, 'uploads'), {
    setHeaders: (res) => {
        res.set('Cross-Origin-Resource-Policy', 'cross-origin');
        res.set('Access-Control-Allow-Origin', '*');
    }
}));

// ===================================
// ROUTES - MUST BE BEFORE 404 HANDLER
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
        environment: process.env.NODE_ENV || 'development'
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
// MONGODB CONNECTION
// ===================================
mongoose.connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
})
    .then(() => {
        console.log('✅ MongoDB Connected Successfully');
        console.log(`📊 Database: ${mongoose.connection.name}`);
    })
    .catch((err) => {
        console.error('❌ MongoDB Connection Error:', err);
    });

// ===================================
// 404 HANDLER - MUST BE LAST
// ===================================
app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: 'Route not found',
        path: req.path,
        method: req.method
    });
});

// ===================================
// ERROR HANDLER
// ===================================
app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(err.status || 500).json({
        success: false,
        message: err.message || 'Internal Server Error'
    });
});

// ===================================
// START SERVER
// ===================================
const PORT = process.env.PORT || 5000;

app.listen(PORT, '0.0.0.0', () => {
    console.log('='.repeat(50));
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📝 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🌐 CORS: Enabled for ALL origins`);
    console.log('='.repeat(50));
});

// ===================================
// GRACEFUL SHUTDOWN
// ===================================
process.on('SIGTERM', () => {
    console.log('SIGTERM received, closing server...');
    mongoose.connection.close(false, () => {
        console.log('MongoDB connection closed');
        process.exit(0);
    });
});

module.exports = app;