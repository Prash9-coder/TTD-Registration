const express = require('express');
const router = express.Router();
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const { body, validationResult } = require('express-validator');
const Team = require('../models/Team');
const { encrypt } = require('../utils/encryption');
const { validateAadhaar } = require('../utils/aadhaarValidator');
const rateLimit = require('express-rate-limit');

const {
    sendNewTeamNotification,
    sendTeamVerifiedNotification,
    sendTeamDeletedNotification
} = require('../services/telegramService');

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
        folder: 'ttd-registrations',
        allowed_formats: ['jpg', 'jpeg', 'png'],
        transformation: [
            { width: 800, height: 1000, crop: 'limit' },
            { quality: 'auto:good' }
        ],
        public_id: (req, file) => {
            const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
            return `member-${uniqueSuffix}`;
        }
    }
});

// ============================================
// FILE FILTER
// ============================================
const fileFilter = (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png'];
    if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Only JPG/JPEG/PNG files are allowed'), false);
    }
};

// ============================================
// MULTER CONFIG
// ============================================
const upload = multer({
    storage,
    fileFilter,
    limits: { fileSize: 5 * 1024 * 1024 }
});

// ============================================
// RATE LIMIT
// ============================================
const submitLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: 'Too many submissions from this IP, try again later.',
    standardHeaders: true,
    legacyHeaders: false,
    trustProxy: true,
    keyGenerator: (req) => req.ip
});

// ============================================
// VALIDATION
// ============================================
const teamValidation = [
    body('team_name').trim().notEmpty(),
    body('members_count').isInt({ min: 10, max: 15 }),
    body('consent_given').equals('true'),
    body('members').isArray({ min: 10, max: 15 })
];

// ============================================
// HELPERS
// ============================================
const mask = (value, visible = 4) => {
    if (!value) return '';
    return `${'*'.repeat(Math.max(0, value.length - visible))}${value.slice(-visible)}`;
};

function calculateAge(dob) {
    if (!dob) return null;
    
    let d;
    if (/^\d{2}-\d{2}-\d{4}$/.test(dob)) {
        const [day, month, year] = dob.split('-');
        d = new Date(year, month - 1, day);
    } else {
        d = new Date(dob);
    }
    
    if (isNaN(d.getTime())) return null;
    
    const t = new Date();
    let age = t.getFullYear() - d.getFullYear();
    if (t.getMonth() < d.getMonth() ||
        (t.getMonth() === d.getMonth() && t.getDate() < d.getDate())) {
        age--;
    }
    return age;
}

// ===================================================================
// GET ALL TEAMS
// ===================================================================
router.get('/', async (req, res) => {
    try {
        const teams = await Team.find({}).sort({ createdAt: -1 });
        console.log(`📋 Found ${teams.length} teams`);
        res.json({ success: true, data: teams });
    } catch (error) {
        console.error('❌ Error fetching teams:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ===================================================================
// CHECK TEAM NAME
// ===================================================================
router.get('/check-name/:teamName', async (req, res) => {
    try {
        const exists = await Team.findOne({
            team_name: { $regex: new RegExp(`^${req.params.teamName}$`, 'i') }
        });
        res.json({ success: true, exists: !!exists });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ===================================================================
// UPLOAD SINGLE PHOTO
// ===================================================================
router.post('/photo', upload.single('photo'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'No file uploaded' });
        }
        res.json({
            success: true,
            message: 'Photo uploaded successfully',
            data: {
                filename: req.file.filename,
                path: req.file.path,
                url: req.file.path
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ===================================================================
// REGISTER TEAM
// ===================================================================
router.post('/', submitLimiter, teamValidation, async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ success: false, errors: errors.array() });
        }

        const { team_name, members_count, members, consent_given } = req.body;

        const nameExists = await Team.findOne({ team_name });
        if (nameExists) {
            return res.status(400).json({ success: false, message: 'Team name already exists' });
        }

        const processedMembers = [];
        const aadhaarSet = new Set();

        for (let i = 0; i < members.length; i++) {
            const m = members[i];
            const aadhaar = validateAadhaar(m.id_number);

            if (!aadhaar.valid) {
                return res.status(400).json({ success: false, message: aadhaar.message });
            }

            if (aadhaarSet.has(m.id_number)) {
                return res.status(400).json({ success: false, message: 'Duplicate Aadhaar found' });
            }

            aadhaarSet.add(m.id_number);

            const age = calculateAge(m.dob);
            if (age !== null && age < 5) {
                return res.status(400).json({ success: false, message: 'Age must be ≥ 5' });
            }

            processedMembers.push({
                ...m,
                age,
                id_number_encrypted: encrypt(m.id_number),
                mobile_encrypted: encrypt(m.mobile),
                id_number_masked: mask(m.id_number),
                mobile_masked: mask(m.mobile),
                photo_path: m.photo_path
            });
        }

        const team = new Team({
            team_name,
            members_count,
            members: processedMembers,
            submission_status: 'pending',
            consent_given: consent_given === 'true',
            submitted_by_ip: req.ip
        });

        await team.save();
        sendNewTeamNotification(team).catch(() => {});

        res.status(201).json({ success: true, message: 'Team registered successfully' });
    } catch (e) {
        console.error('❌ Registration error:', e);
        res.status(500).json({ success: false, message: 'Registration failed' });
    }
});

// ===================================================================
// VERIFY TEAM
// ===================================================================
router.put('/:id/verify', async (req, res) => {
    try {
        const team = await Team.findByIdAndUpdate(
            req.params.id,
            { submission_status: 'verified' },
            { new: true }
        );

        if (!team) {
            return res.status(404).json({ success: false, message: 'Team not found' });
        }

        sendTeamVerifiedNotification(team).catch(() => {});
        res.json({ success: true, message: 'Team verified', team });
    } catch (error) {
        console.error('❌ Verify error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ===================================================================
// ✅ UPDATE TEAM (ADMIN EDIT) - FIXED with validation bypass
// ===================================================================
router.put('/:id', async (req, res) => {
    try {
        const teamId = req.params.id;
        console.log('═'.repeat(50));
        console.log('📝 PUT /api/teams/:id');
        console.log('📝 Team ID:', teamId);
        
        if (!/^[0-9a-fA-F]{24}$/.test(teamId)) {
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid team ID format' 
            });
        }

        const team = await Team.findById(teamId);
        
        if (!team) {
            return res.status(404).json({ 
                success: false, 
                message: 'Team not found'
            });
        }

        console.log('✅ Team found:', team.team_name);

        const { team_name, admin_notes, members, submission_status } = req.body;

        if (team_name !== undefined) team.team_name = team_name;
        if (admin_notes !== undefined) team.admin_notes = admin_notes;
        if (submission_status !== undefined) team.submission_status = submission_status;

        if (members && Array.isArray(members)) {
            console.log('📝 Updating', members.length, 'members');
            
            team.members = members.map((newMember, index) => {
                const existingMember = team.members[index] || {};
                
                // ✅ Merge and ensure all required fields have values
                return {
                    // Start with existing data
                    ...existingMember,
                    // Override with new data
                    name: newMember.name || existingMember.name,
                    dob: newMember.dob || existingMember.dob,
                    age: newMember.age || existingMember.age,
                    gender: newMember.gender || existingMember.gender,
                    
                    // ID fields
                    id_number: newMember.id_number || existingMember.id_number || '',
                    id_number_full: newMember.id_number || existingMember.id_number_full || existingMember.id_number || '',
                    id_number_encrypted: existingMember.id_number_encrypted || '',
                    id_number_masked: newMember.id_number 
                        ? mask(newMember.id_number) 
                        : (existingMember.id_number_masked || ''),
                    
                    // Mobile fields
                    mobile: newMember.mobile || existingMember.mobile || '',
                    mobile_full: newMember.mobile || existingMember.mobile_full || existingMember.mobile || '',
                    mobile_encrypted: existingMember.mobile_encrypted || '',
                    mobile_masked: newMember.mobile 
                        ? mask(newMember.mobile) 
                        : (existingMember.mobile_masked || ''),
                    
                    // Other fields
                    email: newMember.email || existingMember.email || '',
                    state: newMember.state || existingMember.state || '',
                    district: newMember.district || existingMember.district || '',
                    city: newMember.city || existingMember.city || '',
                    street: newMember.street || existingMember.street || '',
                    doorno: newMember.doorno || existingMember.doorno || '',
                    pincode: newMember.pincode || existingMember.pincode || '',
                    nearest_ttd_temple: newMember.nearest_ttd_temple || existingMember.nearest_ttd_temple || '',
                    photo_path: newMember.photo_path || newMember.photo || existingMember.photo_path || '',
                    photo: newMember.photo_path || newMember.photo || existingMember.photo || ''
                };
            });
            
            team.members_count = members.length;
        }

        team.updated_at = new Date();

        // ✅ Save with validation disabled for update
        await team.save({ validateBeforeSave: false });
        
        console.log('✅ Team updated successfully');
        console.log('═'.repeat(50));

        res.json({ 
            success: true, 
            message: 'Team updated successfully',
            team: team
        });

    } catch (error) {
        console.error('❌ Update error:', error.message);
        console.error('Full error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Update failed: ' + error.message 
        });
    }
});

// ===================================================================
// DELETE TEAM
// ===================================================================
router.delete('/:id', async (req, res) => {
    try {
        const team = await Team.findByIdAndDelete(req.params.id);
        if (!team) {
            return res.status(404).json({ success: false, message: 'Team not found' });
        }

        sendTeamDeletedNotification(team).catch(() => {});
        res.json({ success: true, message: 'Team deleted' });
    } catch (error) {
        console.error('❌ Delete error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ===================================================================
// GET SINGLE TEAM (Keep LAST!)
// ===================================================================
router.get('/:id', async (req, res) => {
    try {
        const teamId = req.params.id;
        
        if (!/^[0-9a-fA-F]{24}$/.test(teamId)) {
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid team ID format' 
            });
        }
        
        const team = await Team.findById(teamId);
        
        if (!team) {
            return res.status(404).json({ 
                success: false, 
                message: 'Team not found' 
            });
        }

        res.json({ success: true, data: team });
    } catch (error) {
        console.error('❌ Get team error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;