const express = require('express');
const router = express.Router();
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

// ============================================
// CLOUDINARY CONFIGURATION
// ============================================
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

// ============================================
// CLOUDINARY STORAGE CONFIGURATION
// ============================================
const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'ttd-registrations', // Folder in Cloudinary
        allowed_formats: ['jpg', 'jpeg', 'png'],
        transformation: [
            { width: 800, height: 1000, crop: 'limit' }, // Max dimensions
            { quality: 'auto:good' } // Auto optimize
        ],
        public_id: (req, file) => {
            // Generate unique filename
            const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
            return `member-${uniqueSuffix}`;
        }
    }
});

// ============================================
// FILE FILTER - Only JPG/JPEG
// ============================================
const fileFilter = (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/jpg'];

    if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Only JPG/JPEG files are allowed'), false);
    }
};

// ============================================
// MULTER CONFIGURATION
// ============================================
const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 2 * 1024 * 1024 // 2MB max (increased from 1MB)
    }
});

// ============================================
// UPLOAD SINGLE PHOTO
// ============================================
router.post('/photo', upload.single('photo'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'No file uploaded'
            });
        }

        console.log('✅ Photo uploaded to Cloudinary');
        console.log('   URL:', req.file.path);
        console.log('   Public ID:', req.file.filename);
        console.log('   Size:', Math.round(req.file.size / 1024) + 'KB');

        res.json({
            success: true,
            message: 'Photo uploaded successfully',
            data: {
                filename: req.file.filename, // Cloudinary public ID
                path: req.file.path, // Full Cloudinary URL
                url: req.file.path, // Same as path
                cloudinary_id: req.file.filename,
                size: req.file.size,
                mimetype: req.file.mimetype,
                format: req.file.format
            }
        });

    } catch (error) {
        console.error('❌ Upload error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'File upload failed'
        });
    }
});

// ============================================
// UPLOAD MULTIPLE PHOTOS
// ============================================
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
            path: file.path,
            url: file.path,
            cloudinary_id: file.filename,
            size: file.size,
            mimetype: file.mimetype
        }));

        console.log(`✅ ${req.files.length} photos uploaded to Cloudinary`);

        res.json({
            success: true,
            message: `${req.files.length} files uploaded successfully`,
            data: uploadedFiles
        });

    } catch (error) {
        console.error('❌ Multiple upload error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Files upload failed'
        });
    }
});

// ============================================
// DELETE PHOTO (Optional - for cleanup)
// ============================================
router.delete('/photo/:publicId', async (req, res) => {
    try {
        const publicId = `ttd-registrations/${req.params.publicId}`;

        const result = await cloudinary.uploader.destroy(publicId);

        console.log('🗑️ Photo deleted from Cloudinary:', publicId);

        res.json({
            success: true,
            message: 'Photo deleted successfully',
            data: result
        });

    } catch (error) {
        console.error('❌ Delete photo error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete photo'
        });
    }
});

// ============================================
// GET PHOTO INFO (Optional)
// ============================================
router.get('/info/:publicId', async (req, res) => {
    try {
        const publicId = `ttd-registrations/${req.params.publicId}`;

        const result = await cloudinary.api.resource(publicId);

        res.json({
            success: true,
            data: {
                url: result.secure_url,
                format: result.format,
                size: result.bytes,
                width: result.width,
                height: result.height,
                created_at: result.created_at
            }
        });

    } catch (error) {
        console.error('Get photo info error:', error);
        res.status(404).json({
            success: false,
            message: 'Photo not found'
        });
    }
});

// ============================================
// ERROR HANDLING MIDDLEWARE
// ============================================
router.use((error, req, res, next) => {
    if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({
                success: false,
                message: 'File size cannot exceed 2MB'
            });
        }
        if (error.code === 'LIMIT_UNEXPECTED_FILE') {
            return res.status(400).json({
                success: false,
                message: 'Too many files uploaded'
            });
        }
        return res.status(400).json({
            success: false,
            message: error.message
        });
    }

    // Cloudinary errors
    if (error.message) {
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }

    next(error);
});

module.exports = router;