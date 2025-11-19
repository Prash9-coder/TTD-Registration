const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const AWS = require('aws-sdk');

// Configure AWS S3 (if using S3)
const s3 = new AWS.S3({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: process.env.AWS_REGION
});

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer for local storage
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const teamDir = path.join(uploadsDir, 'teams');
        if (!fs.existsSync(teamDir)) {
            fs.mkdirSync(teamDir, { recursive: true });
        }
        cb(null, teamDir);
    },
    filename: function (req, file, cb) {
        // Generate unique filename
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'member-' + uniqueSuffix + path.extname(file.originalname));
    }
});

// File filter - only accept JPG/JPEG
const fileFilter = (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/jpg'];

    if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Only JPG/JPEG files are allowed'), false);
    }
};

// Multer configuration
const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 1 * 1024 * 1024 // 1MB max
    }
});

// POST /api/upload/photo - Upload single photo
router.post('/photo', upload.single('photo'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'No file uploaded'
            });
        }

        // If using S3, upload to S3
        if (process.env.UPLOAD_TYPE === 's3') {
            try {
                const fileContent = fs.readFileSync(req.file.path);

                const params = {
                    Bucket: process.env.AWS_S3_BUCKET,
                    Key: `teams/${req.file.filename}`,
                    Body: fileContent,
                    ContentType: req.file.mimetype,
                    ACL: 'private' // Keep files private
                };

                const s3Result = await s3.upload(params).promise();

                // Delete local file after S3 upload
                fs.unlinkSync(req.file.path);

                return res.json({
                    success: true,
                    message: 'File uploaded to S3 successfully',
                    data: {
                        filename: req.file.filename,
                        path: s3Result.Key,
                        url: s3Result.Location, // Full S3 URL for direct access
                        size: req.file.size
                    }
                });
            } catch (s3Error) {
                console.error('S3 upload error:', s3Error);
                // Fallback to local storage
                return res.json({
                    success: true,
                    message: 'File uploaded locally (S3 failed)',
                    data: {
                        filename: req.file.filename,
                        path: `/uploads/teams/${req.file.filename}`,
                        size: req.file.size
                    }
                });
            }
        }

        // Local storage response
        res.json({
            success: true,
            message: 'File uploaded successfully',
            data: {
                filename: req.file.filename,
                path: `/uploads/teams/${req.file.filename}`,
                size: req.file.size,
                mimetype: req.file.mimetype
            }
        });

    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'File upload failed'
        });
    }
});

// POST /api/upload/photos - Upload multiple photos
router.post('/photos', upload.array('photos', 15), async (req, res) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No files uploaded'
            });
        }

        const uploadedFiles = req.files.map(file => ({
            filename: file.filename,
            path: `/uploads/teams/${file.filename}`,
            size: file.size,
            mimetype: file.mimetype
        }));

        res.json({
            success: true,
            message: `${req.files.length} files uploaded successfully`,
            data: uploadedFiles
        });

    } catch (error) {
        console.error('Multiple upload error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Files upload failed'
        });
    }
});

// GET /api/upload/:filename - Get uploaded file (with authentication in production)
router.get('/:filename', (req, res) => {
    try {
        const filename = req.params.filename;
        const filepath = path.join(uploadsDir, 'teams', filename);

        if (!fs.existsSync(filepath)) {
            return res.status(404).json({
                success: false,
                message: 'File not found'
            });
        }

        res.sendFile(filepath);

    } catch (error) {
        console.error('File retrieval error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve file'
        });
    }
});

// Error handling middleware for multer
router.use((error, req, res, next) => {
    if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({
                success: false,
                message: 'File size cannot exceed 1MB'
            });
        }
        return res.status(400).json({
            success: false,
            message: error.message
        });
    }
    next(error);
});

module.exports = router;