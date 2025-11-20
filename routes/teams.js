const express = require('express');
const router = express.Router();
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


// ===============================================
// RATE LIMIT
// ===============================================
const submitLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: 'Too many submissions from this IP, try again later.',
    standardHeaders: true,
    legacyHeaders: false,
    trustProxy: true,
    keyGenerator: (req) => req.ip
});


// ===============================================
// VALIDATION
// ===============================================
const teamValidation = [
    body('team_name').trim().notEmpty(),
    body('members_count').isInt({ min: 10, max: 15 }),
    body('consent_given').equals('true'),
    body('members').isArray({ min: 10, max: 15 })
];


// ===============================================
// EMAIL / SENDGRID IMPORTS
// ===============================================
const sgMail = require('@sendgrid/mail');

if (process.env.SENDGRID_API_KEY) {
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);
}


// MASK HELPER
const mask = (value, visible = 4) =>
    `${'*'.repeat(Math.max(0, value.length - visible))}${value.slice(-visible)}`;


// CALCULATE AGE
function calculateAge(dob) {
    const d = new Date(dob);
    const t = new Date();
    let age = t.getFullYear() - d.getFullYear();
    if (
        t.getMonth() < d.getMonth() ||
        (t.getMonth() === d.getMonth() && t.getDate() < d.getDate())
    )
        age--;
    return age;
}


// ===================================================================
// 🚀 POST /api/teams  — REGISTER TEAM
// ===================================================================
router.post('/', submitLimiter, teamValidation, async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty())
            return res.status(400).json({ success: false, errors: errors.array() });

        const { team_name, members_count, members, consent_given } = req.body;

        // Prevent duplicate team_name
        const nameExists = await Team.findOne({ team_name });
        if (nameExists)
            return res.status(400).json({ success: false, message: 'Team name already exists' });

        if (members.length !== members_count)
            return res.status(400).json({
                success: false,
                message: 'members_count mismatch'
            });

        const processedMembers = [];
        const aadhaarSet = new Set();

        for (let i = 0; i < members.length; i++) {
            const m = members[i];

            // Aadhaar validation
            const aadhaar = validateAadhaar(m.id_number);
            if (!aadhaar.valid)
                return res.status(400).json({
                    success: false,
                    message: `Member ${i + 1}: ${aadhaar.message}`
                });

            // Avoid duplicates inside team
            if (aadhaarSet.has(m.id_number))
                return res.status(400).json({
                    success: false,
                    message: `Duplicate Aadhaar at member ${i + 1}`
                });
            aadhaarSet.add(m.id_number);

            // Avoid duplicate across DB (encrypted)
            const exists = await Team.findOne({
                'members.id_number_encrypted': encrypt(m.id_number)
            });

            if (exists)
                return res.status(400).json({
                    success: false,
                    message: `Aadhaar of member ${i + 1} already registered`
                });

            const age = calculateAge(m.dob);
            if (age < 5)
                return res.status(400).json({
                    success: false,
                    message: `Member ${i + 1} must be ≥ 5 years`
                });

            // ✅ Photo validation - must be full Cloudinary URL
            const photoUrl = m.photo_path;

            if (!photoUrl || !photoUrl.startsWith('http')) {
                return res.status(400).json({
                    success: false,
                    message: `Invalid or missing photo for member ${i + 1}`
                });
            }

            processedMembers.push({
                name: m.name,
                dob: new Date(m.dob),
                age,
                gender: m.gender,
                id_proof_type: m.id_proof_type || 'Aadhaar',

                id_number_full: m.id_number,
                mobile_full: m.mobile,

                id_number_encrypted: encrypt(m.id_number),
                mobile_encrypted: encrypt(m.mobile),

                id_number_masked: mask(m.id_number),
                mobile_masked: mask(m.mobile),

                email: m.email,
                state: m.state,
                district: m.district,
                city: m.city,
                street: m.street,
                doorno: m.doorno,
                pincode: m.pincode,
                nearest_ttd_temple: m.nearest_ttd_temple,

                // ✅ Store full Cloudinary URL as-is
                photo_path: photoUrl,
                photo_uploaded_at: new Date(),

                aadhaar_verified: false
            });
        }

        // CREATE TEAM
        const newTeam = new Team({
            team_name,
            members_count,
            members: processedMembers,
            submission_status: 'pending',
            consent_given: consent_given === 'true',
            submitted_by_ip: req.ip
        });

        await newTeam.save();

        // SEND EMAILS / TELEGRAM
        sendNewTeamNotification(newTeam).catch(() => { });

        return res.status(201).json({
            success: true,
            message: 'Team registered successfully',
            data: {
                team_id: newTeam._id,
                team_name: newTeam.team_name,
                members_count: newTeam.members_count,
                submitted_at: newTeam.created_at
            }
        });

    } catch (e) {
        console.error('Team registration error:', e);
        res.status(500).json({ success: false, message: 'Failed to register team' });
    }
});


// ===================================================================
// ✅ GET ALL TEAMS WITH MEMBERS & PHOTOS
// ===================================================================
router.get('/', async (req, res) => {
    try {
        const teams = await Team.find({})
            .select('_id team_name members_count submission_status created_at members')  // ✅ Added 'members'
            .sort({ created_at: -1 })
            .lean();

        // Transform members to include safe data
        const transformedTeams = teams.map(team => ({
            _id: team._id,
            team_name: team.team_name,
            members_count: team.members_count,
            submission_status: team.submission_status,
            created_at: team.created_at,
            members: team.members.map(m => ({
                name: m.name,
                dob: m.dob,
                age: m.age,
                gender: m.gender,
                id_number: m.id_number_masked,  // Masked for security
                mobile: m.mobile_masked,
                email: m.email,
                state: m.state,
                district: m.district,
                city: m.city,
                street: m.street,
                doorno: m.doorno,
                pincode: m.pincode,
                nearest_ttd_temple: m.nearest_ttd_temple,
                photo_path: m.photo_path,  // ✅ Full Cloudinary URL
                aadhaar_verified: m.aadhaar_verified
            }))
        }));

        res.json({
            success: true,
            count: transformedTeams.length,
            data: transformedTeams
        });

    } catch (e) {
        console.error('Get teams error:', e);
        res.status(500).json({ success: false, message: 'Failed to retrieve teams' });
    }
});


// ===================================================================
// ✅ GET SINGLE TEAM BY ID
// ===================================================================
router.get('/:id', async (req, res) => {
    try {
        const team = await Team.findById(req.params.id).lean();

        if (!team)
            return res.status(404).json({ success: false, message: 'Team not found' });

        // Transform members with full details
        team.members = team.members.map(m => ({
            name: m.name,
            dob: m.dob,
            age: m.age,
            gender: m.gender,
            id_number: m.id_number_full,  // Full for detailed view
            mobile: m.mobile_full,
            email: m.email,
            state: m.state,
            district: m.district,
            city: m.city,
            street: m.street,
            doorno: m.doorno,
            pincode: m.pincode,
            nearest_ttd_temple: m.nearest_ttd_temple,
            photo_path: m.photo_path,  // ✅ Already full Cloudinary URL
            aadhaar_verified: m.aadhaar_verified
        }));

        res.json({ success: true, data: team });

    } catch (e) {
        console.error('Get team error:', e);
        res.status(500).json({ success: false, message: 'Failed to retrieve team' });
    }
});


// ===================================================================
// CHECK TEAM NAME AVAILABILITY
// ===================================================================
router.get('/check-name/:teamName', async (req, res) => {
    try {
        const teamName = req.params.teamName.trim();

        if (!teamName || teamName.length < 3) {
            return res.json({
                success: true,
                exists: false,
                message: 'Team name too short'
            });
        }

        const exists = await Team.findOne({
            team_name: { $regex: new RegExp(`^${teamName}$`, 'i') }
        });

        res.json({
            success: true,
            exists: !!exists,
            message: exists ? 'Team name already exists' : 'Team name available'
        });

    } catch (e) {
        console.error('Check name error:', e);
        res.status(500).json({ success: false, message: 'Check failed' });
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

        if (!team)
            return res.status(404).json({ success: false, message: 'Team not found' });

        sendTeamVerifiedNotification(team).catch(() => { });

        res.json({ success: true, message: 'Team verified', data: team });

    } catch (e) {
        console.error('Verify team error:', e);
        res.status(500).json({ success: false, message: 'Verification failed' });
    }
});


// ===================================================================
// DELETE TEAM
// ===================================================================
router.delete('/:id', async (req, res) => {
    try {
        const team = await Team.findByIdAndDelete(req.params.id);

        if (!team)
            return res.status(404).json({ success: false, message: 'Team not found' });

        sendTeamDeletedNotification(team).catch(() => { });

        res.json({ success: true, message: 'Team deleted successfully' });

    } catch (e) {
        console.error('Delete team error:', e);
        res.status(500).json({ success: false, message: 'Delete failed' });
    }
});


module.exports = router;