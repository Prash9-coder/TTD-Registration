const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');
const { validateAadhaar } = require('../utils/aadhaarValidator');
const Team = require('../models/Team');
const { encrypt } = require('../utils/encryption');

// Rate limiting for verification endpoint
const verifyLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // 10 requests per window
    message: 'Too many verification requests, please try again later.'
});

// Validation middleware
const verificationValidation = [
    body('aadhaar').trim().notEmpty().withMessage('Aadhaar number is required'),
    body('mobile').trim().notEmpty().withMessage('Mobile number is required')
];

// POST /api/verification/aadhaar - Verify Aadhaar with OTP
router.post('/aadhaar', verifyLimiter, verificationValidation, async (req, res) => {
    try {
        // Validate request
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        const { aadhaar, mobile } = req.body;

        // Client-side validation check
        const aadhaarValidation = validateAadhaar(aadhaar);
        if (!aadhaarValidation.valid) {
            return res.status(400).json({
                success: false,
                message: aadhaarValidation.message
            });
        }

        // Validate mobile number
        if (!/^\+?91?\d{10}$/.test(mobile.replace(/\s/g, ''))) {
            return res.status(400).json({
                success: false,
                message: 'Invalid mobile number format'
            });
        }

        // Log verification attempt (DO NOT log raw Aadhaar)
        console.log(`Aadhaar verification attempt - Mobile: ${mobile.slice(-4)}, IP: ${req.ip}`);

        // Check verification provider type
        const provider = process.env.AADHAAR_PROVIDER || 'mock';

        let verificationResult;

        switch (provider) {
            case 'mock':
                // Mock verification for development
                verificationResult = await mockAadhaarVerification(aadhaar, mobile);
                break;

            case 'karza':
                // Karza API integration
                verificationResult = await karzaVerification(aadhaar, mobile);
                break;

            case 'signzy':
                // Signzy API integration
                verificationResult = await signzyVerification(aadhaar, mobile);
                break;

            default:
                verificationResult = {
                    success: false,
                    message: 'Invalid verification provider configured'
                };
        }

        // Return verification result
        res.json({
            success: verificationResult.success,
            message: verificationResult.message,
            data: {
                verification_id: verificationResult.verification_id,
                status: verificationResult.status,
                timestamp: new Date().toISOString()
            }
        });

    } catch (error) {
        console.error('Aadhaar verification error:', error);
        res.status(500).json({
            success: false,
            message: 'Verification service temporarily unavailable'
        });
    }
});

// POST /api/verification/otp - Verify OTP (second step)
router.post('/otp', verifyLimiter, async (req, res) => {
    try {
        const { verification_id, otp } = req.body;

        if (!verification_id || !otp) {
            return res.status(400).json({
                success: false,
                message: 'Verification ID and OTP are required'
            });
        }

        // Validate OTP format (6 digits)
        if (!/^\d{6}$/.test(otp)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid OTP format'
            });
        }

        const provider = process.env.AADHAAR_PROVIDER || 'mock';

        let otpResult;

        switch (provider) {
            case 'mock':
                otpResult = await mockOTPVerification(verification_id, otp);
                break;

            case 'karza':
                otpResult = await karzaOTPVerification(verification_id, otp);
                break;

            case 'signzy':
                otpResult = await signzyOTPVerification(verification_id, otp);
                break;

            default:
                otpResult = {
                    success: false,
                    message: 'Invalid verification provider'
                };
        }

        res.json({
            success: otpResult.success,
            message: otpResult.message,
            data: otpResult.data
        });

    } catch (error) {
        console.error('OTP verification error:', error);
        res.status(500).json({
            success: false,
            message: 'OTP verification failed'
        });
    }
});

// Mock Aadhaar verification (for development)
async function mockAadhaarVerification(aadhaar, mobile) {
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Mock success response
    return {
        success: true,
        message: 'OTP sent successfully (Mock)',
        verification_id: 'MOCK_' + Date.now(),
        status: 'otp_sent'
    };
}

// Mock OTP verification
async function mockOTPVerification(verificationId, otp) {
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Accept any 6-digit OTP in mock mode
    if (otp === '123456' || otp.length === 6) {
        return {
            success: true,
            message: 'Aadhaar verified successfully (Mock)',
            data: {
                verified: true,
                name: 'Mock User',
                verification_timestamp: new Date().toISOString()
            }
        };
    }

    return {
        success: false,
        message: 'Invalid OTP'
    };
}

// Karza API Integration (placeholder)
async function karzaVerification(aadhaar, mobile) {
    // TODO: Implement Karza API integration
    // const response = await fetch(process.env.AADHAAR_API_URL, {
    //     method: 'POST',
    //     headers: {
    //         'x-api-key': process.env.AADHAAR_API_KEY,
    //         'Content-Type': 'application/json'
    //     },
    //     body: JSON.stringify({ aadhaar, mobile })
    // });

    throw new Error('Karza integration not implemented. Set AADHAAR_PROVIDER=mock for development.');
}

async function karzaOTPVerification(verificationId, otp) {
    throw new Error('Karza OTP verification not implemented');
}

// Signzy API Integration (placeholder)
async function signzyVerification(aadhaar, mobile) {
    throw new Error('Signzy integration not implemented. Set AADHAAR_PROVIDER=mock for development.');
}

async function signzyOTPVerification(verificationId, otp) {
    throw new Error('Signzy OTP verification not implemented');
}

module.exports = router;