const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const Team = require('../models/Team');
const { encrypt, decrypt } = require('../utils/encryption');
const { validateAadhaar } = require('../utils/aadhaarValidator');
const rateLimit = require('express-rate-limit');

// Helper function to construct photo URLs
function constructPhotoUrl(photoPath) {
    if (!photoPath) return null;

    // If it's already a full URL (S3), return as is
    if (photoPath.startsWith('http')) {
        return photoPath;
    }

    // For local storage, construct API URL
    if (photoPath.startsWith('/uploads/')) {
        const baseUrl =
            process.env.NODE_ENV === 'production'
                ? process.env.API_BASE_URL || 'https://ttd-registration.onrender.com'
                : `http://localhost:${process.env.PORT || 5000}`;
        return `${baseUrl}${photoPath}`;
    }

    // Fallback
    return photoPath;
}

// Rate limit
const submitLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: 'Too many submissions from this IP, try again later.',
    standardHeaders: true,
    legacyHeaders: false,
    // Trust proxy headers from Render
    trustProxy: true,
    // Custom key generator
    keyGenerator: (req) => {
        return req.ip || req.connection.remoteAddress;
    }
});

// Validation
const teamValidation = [
    body('team_name').trim().notEmpty(),
    body('members_count').isInt({ min: 10, max: 15 }),
    body('consent_given').equals('true'),
    body('members').isArray({ min: 10, max: 15 })
];


const nodemailer = require('nodemailer');
const sgMail = require('@sendgrid/mail');

// Set SendGrid API Key
if (process.env.SENDGRID_API_KEY) {
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);
}

async function sendAdminNotification(team) {
    console.log('📧 Sending admin notification via SendGrid...');
    console.log('To:', process.env.ADMIN_EMAIL);

    try {
        const html = `
            <!DOCTYPE html>
            <html>
            <body style="font-family: Arial, sans-serif; padding: 20px;">
                <div style="max-width: 600px; margin: 0 auto; background: #f9fafb; padding: 30px; border-radius: 10px;">
                    <h2 style="color: #1f2937; border-bottom: 3px solid #2563eb; padding-bottom: 10px;">
                        🔔 New Team Registration Alert
                    </h2>
                    
                    <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
                        <p><strong>Team Name:</strong> ${team.team_name}</p>
                        <p><strong>Members:</strong> ${team.members_count}</p>
                        <p><strong>Registered:</strong> ${new Date(team.created_at).toLocaleString('en-IN')}</p>
                        <p><strong>Team Leader:</strong> ${team.members[0]?.name}</p>
                        <p><strong>Contact:</strong> ${team.members[0]?.mobile_full} | ${team.members[0]?.email}</p>
                    </div>

                    <div style="text-align: center; margin-top: 25px;">
                        <a href="${process.env.ADMIN_DASHBOARD_URL || process.env.FRONTEND_URL + '/admin'}" 
                           style="background: #2563eb; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; display: inline-block;">
                            Open Admin Panel →
                        </a>
                    </div>
                </div>
            </body>
            </html>
        `;

        const msg = {
            to: process.env.ADMIN_EMAIL,
            from: {
                email: process.env.SENDGRID_FROM_EMAIL || 'nimmalaprashanth9@gmail.com',
                name: 'TTD Registration'
            },
            subject: `🔔 New Registration: ${team.team_name} (${team.members_count} members)`,
            html: html
        };

        await sgMail.send(msg);
        console.log('✅ Admin notification sent successfully via SendGrid');
    } catch (err) {
        console.error('❌ SendGrid admin email failed:', err);
        if (err.response) {
            console.error('Response body:', err.response.body);
        }
    }
}

async function sendUserConfirmation(team) {
    console.log('📧 Sending user confirmation via SendGrid...');
    console.log('To:', team.members[0].email);

    try {
        const html = `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
                    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                    .header { background: linear-gradient(135deg, #ea580c, #dc2626); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
                    .content { background: #ffffff; padding: 30px; border: 1px solid #e5e7eb; border-top: none; }
                    .info-box { background: #f9fafb; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #ea580c; }
                    .member-card { background: #f3f4f6; padding: 12px; margin: 8px 0; border-radius: 6px; border-left: 3px solid #2563eb; }
                    .alert-box { background: #fef3c7; border: 1px solid #fbbf24; padding: 15px; border-radius: 8px; margin: 20px 0; }
                    .footer { text-align: center; color: #6b7280; font-size: 12px; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1 style="margin: 0;">🙏 TTD Team Registration</h1>
                        <p style="margin: 10px 0 0 0; opacity: 0.9; font-size: 16px;">Registration Successful</p>
                    </div>
                    
                    <div class="content">
                        <h2 style="color: #1f2937;">Namaste ${team.members[0].name}! 🙏</h2>
                        <p style="font-size: 15px;">
                            Your team <strong style="color: #ea580c;">${team.team_name}</strong> has been 
                            <strong>successfully registered</strong> for TTD Darshan.
                        </p>
                        
                        <div class="info-box">
                            <h3 style="margin-top: 0; color: #ea580c;">📋 Registration Summary</h3>
                            <p style="margin: 8px 0;"><strong>Team Name:</strong> ${team.team_name}</p>
                            <p style="margin: 8px 0;"><strong>Total Members:</strong> ${team.members_count}</p>
                            <p style="margin: 8px 0;"><strong>Registration Date:</strong> ${new Date(team.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })}</p>
                            <p style="margin: 8px 0;">
                                <strong>Status:</strong> 
                                <span style="color: #f59e0b; font-weight: bold;">⏳ Pending Verification</span>
                            </p>
                        </div>

                        <h3 style="color: #1f2937;">👥 Registered Members:</h3>
                        ${team.members.map((member, index) => `
                            <div class="member-card">
                                <strong>${index + 1}. ${member.name}</strong><br>
                                <small style="color: #4b5563;">
                                    Age: ${member.age} | Gender: ${member.gender}<br>
                                    📱 ${member.mobile_full || member.mobile_masked} | 
                                    ✉️ ${member.email}
                                </small>
                            </div>
                        `).join('')}

                        <div class="alert-box">
                            <strong style="color: #92400e;">⚠️ Important Next Steps:</strong>
                            <ul style="margin: 12px 0; padding-left: 20px; line-height: 1.8;">
                                <li>Your registration is <strong>under verification</strong></li>
                                <li>You will receive <strong>confirmation within 24-48 hours</strong></li>
                                <li>Keep your registered <strong>mobile number active</strong></li>
                                <li>Carry <strong>original ID proofs (Aadhaar)</strong> for all members</li>
                            </ul>
                        </div>

                        <div style="background: #dbeafe; padding: 18px; border-radius: 8px; margin: 20px 0; text-align: center;">
                            <p style="margin: 0; font-size: 18px;"><strong>🕉️ Govinda Govinda!</strong></p>
                            <p style="margin: 8px 0 0 0; font-size: 14px;">May Lord Venkateswara bless your journey!</p>
                        </div>
                    </div>

                    <div class="footer">
                        <p><strong>TTD Team Registration System</strong></p>
                        <p>© ${new Date().getFullYear()} All Rights Reserved</p>
                    </div>
                </div>
            </body>
            </html>
        `;

        const msg = {
            to: team.members[0].email,
            from: {
                email: process.env.SENDGRID_FROM_EMAIL || 'nimmalaprashanth9@gmail.com',
                name: 'TTD Registration'
            },
            subject: `✅ Registration Successful – ${team.team_name} | TTD Darshan`,
            html: html
        };

        await sgMail.send(msg);
        console.log('✅ User confirmation sent successfully via SendGrid');
    } catch (err) {
        console.error('❌ SendGrid user email failed:', err);
        if (err.response) {
            console.error('Response body:', err.response.body);
        }
    }
}

async function sendVerificationEmail(team) {
    console.log('📧 Sending verification emails via SendGrid to all members...');

    try {
        const html = `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body { font-family: Arial, sans-serif; }
                    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                    .header { background: linear-gradient(135deg, #10b981, #059669); color: white; padding: 40px 30px; text-align: center; border-radius: 10px 10px 0 0; }
                    .content { background: #ffffff; padding: 30px; border: 1px solid #e5e7eb; border-top: none; }
                    .badge { background: #d1fae5; color: #065f46; padding: 10px 25px; border-radius: 25px; display: inline-block; font-weight: bold; font-size: 16px; margin: 20px 0; }
                    .success-box { background: #ecfdf5; border: 2px solid #10b981; padding: 20px; border-radius: 10px; margin: 20px 0; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <div style="font-size: 60px; margin-bottom: 15px;">✅</div>
                        <h1 style="margin: 0; font-size: 28px;">Team Verification Successful!</h1>
                    </div>
                    
                    <div class="content">
                        <h2 style="color: #1f2937;">Congratulations ${team.team_name}! 🎉</h2>
                        
                        <p style="font-size: 16px;">
                            Your team registration has been 
                            <span class="badge">✓ VERIFIED</span>
                        </p>
                        
                        <div class="success-box">
                            <h3 style="margin-top: 0; color: #065f46;">🎊 What's Next?</h3>
                            <ul style="line-height: 1.9; padding-left: 20px;">
                                <li><strong>Your team is now approved</strong> for TTD Darshan</li>
                                <li>Total verified members: <strong>${team.members_count}</strong></li>
                                <li>Carry <strong>original Aadhaar cards</strong> for all members</li>
                                <li>Follow all TTD guidelines and protocols</li>
                            </ul>
                        </div>

                        <div style="text-align: center; margin: 30px 0; padding: 25px; background: linear-gradient(135deg, #dbeafe, #bfdbfe); border-radius: 12px;">
                            <p style="font-size: 22px; margin: 0; font-weight: bold;">🕉️ Om Namo Venkatesaya!</p>
                            <p style="margin: 10px 0 0 0; font-size: 15px;">May Lord Balaji bless you!</p>
                        </div>
                    </div>
                </div>
            </body>
            </html>
        `;

        // Send to all team members
        const emails = team.members.map(m => m.email).filter(Boolean);

        for (const email of emails) {
            const msg = {
                to: email,
                from: {
                    email: process.env.SENDGRID_FROM_EMAIL || 'nimmalaprashanth9@gmail.com',
                    name: 'TTD Registration'
                },
                subject: `✅ VERIFIED - ${team.team_name} | TTD Registration Approved`,
                html: html
            };

            await sgMail.send(msg);
            console.log(`✅ Verification email sent to: ${email}`);

            // Small delay between emails
            await new Promise(resolve => setTimeout(resolve, 500));
        }

        console.log(`✅ All ${emails.length} verification emails sent successfully`);
    } catch (err) {
        console.error('❌ SendGrid verification emails failed:', err);
        if (err.response) {
            console.error('Response body:', err.response.body);
        }
    }
}

// Helper
const mask = (value, visible = 4) =>
    `${'*'.repeat(Math.max(0, value.length - visible))}${value.slice(-visible)}`;

// POST /api/teams (register)
router.post('/', submitLimiter, teamValidation, async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty())
            return res.status(400).json({ success: false, errors: errors.array() });

        const { team_name, members_count, members, consent_given } = req.body;

        // prevent duplicate name
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

            // prevent duplicate within team
            if (aadhaarSet.has(m.id_number))
                return res.status(400).json({
                    success: false,
                    message: `Duplicate Aadhaar at member ${i + 1}`
                });
            aadhaarSet.add(m.id_number);

            // prevent duplicate across DB
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
                photo_path: m.photo_path,
                photo_uploaded_at: new Date(),
                aadhaar_verified: false
            });
        }

        const newTeam = new Team({
            team_name,
            members_count,
            members: processedMembers,
            submission_status: 'pending',
            consent_given: consent_given === 'true',
            submitted_by_ip: req.ip
        });

        await newTeam.save();

        // 🔥 SEND EMAIL HERE
        sendAdminNotification(newTeam).catch(err => {
            console.error("Email error:", err);
        });

        sendUserConfirmation(newTeam).catch(err => {
            console.error("User email error:", err);
        });

        res.status(201).json({
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

router.delete("/:id", async (req, res) => {
    try {
        const deleted = await Team.findByIdAndDelete(req.params.id);

        if (!deleted) {
            return res.status(404).json({
                success: false,
                message: "Team not found"
            });
        }

        res.json({
            success: true,
            message: "Team deleted successfully"
        });

    } catch (err) {
        console.error("Delete team error:", err);
        res.status(500).json({
            success: false,
            message: "Failed to delete team"
        });
    }
});


// GET /api/teams/:id (FULL data for admin)
router.get('/:id', async (req, res) => {
    try {
        const team = await Team.findById(req.params.id).lean();
        if (!team)
            return res.status(404).json({ success: false, message: 'Team not found' });

        // return FULL data (admin only)
        team.members = team.members.map(m => ({
            name: m.name,
            dob: m.dob,
            age: m.age,
            gender: m.gender,
            id_number: m.id_number_full,
            mobile: m.mobile_full,
            email: m.email,
            state: m.state,
            district: m.district,
            city: m.city,
            street: m.street,
            doorno: m.doorno,
            pincode: m.pincode,
            nearest_ttd_temple: m.nearest_ttd_temple,
            photo_path: m.photo_path,
            photoPreview: m.photo_path ? constructPhotoUrl(m.photo_path) : null,
            aadhaar_verified: m.aadhaar_verified
        }));


        res.json({ success: true, data: team });
    } catch (e) {
        console.error('Get full team error:', e);
        res.status(500).json({ success: false, message: 'Failed to retrieve team' });
    }
});

router.put("/:id/verify", async (req, res) => {
    try {
        const updated = await Team.findByIdAndUpdate(
            req.params.id,
            { submission_status: "verified" },
            { new: true }
        );

        if (!updated) {
            return res.status(404).json({
                success: false,
                message: "Team not found"
            });
        }

        // 🔥 SEND VERIFICATION EMAIL TO ALL MEMBERS
        sendVerificationEmail(updated).catch(err => {
            console.error("Verification email error:", err);
        });

        res.json({
            success: true,
            message: "Team verified successfully and emails sent!",
            data: updated
        });

    } catch (err) {
        console.error("Verify team error:", err);
        res.status(500).json({ success: false, message: "Failed to verify team" });
    }
});


// MARK TEAM AS VERIFIED
router.put("/:id/verify", async (req, res) => {
    try {
        const updated = await Team.findByIdAndUpdate(
            req.params.id,
            { submission_status: "verified" },
            { new: true }
        );

        if (!updated) {
            return res.status(404).json({
                success: false,
                message: "Team not found"
            });
        }

        res.json({
            success: true,
            message: "Team verified successfully",
            data: updated
        });

    } catch (err) {
        console.error("Verify team error:", err);
        res.status(500).json({ success: false, message: "Failed to verify team" });
    }
});


// GET /api/teams (list only for admin)
router.get('/', async (req, res) => {
    try {
        const teams = await Team.find({})
            .select('_id team_name members_count submission_status created_at')
            .sort({ created_at: -1 });

        res.json({ success: true, data: teams });
    } catch (e) {
        console.error('Get teams error:', e);
        res.status(500).json({ success: false, message: 'Failed to retrieve teams' });
    }
});

// Check if team name exists (for real-time validation)
router.get('/check-name/:teamName', async (req, res) => {
    try {
        const teamName = req.params.teamName.trim();

        if (!teamName) {
            return res.json({
                success: true,
                exists: false
            });
        }

        // Case-insensitive search
        const existingTeam = await Team.findOne({
            team_name: { $regex: new RegExp(`^${teamName}$`, 'i') }
        });

        res.json({
            success: true,
            exists: !!existingTeam,
            message: existingTeam
                ? 'Team name already exists'
                : 'Team name is available'
        });

    } catch (error) {
        console.error('Team name check error:', error);
        res.status(500).json({
            success: false,
            message: 'Error checking team name'
        });
    }
});

// Age calculation
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

module.exports = router;
