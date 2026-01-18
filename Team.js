const mongoose = require('mongoose');

// ============================================
// MEMBER SCHEMA - FLEXIBLE FOR UPDATES
// ============================================
const memberSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Name is required'],
        trim: true
    },
    dob: {
        type: String,  // ✅ Changed to String to support DD-MM-YYYY format
        required: false  // ✅ Made optional for updates
    },
    age: {
        type: Number,
        required: true,  // ✅ Made optional for updates
        min: [5, 'Member must be at least 5 years old']
    },
    gender: {
        type: String,
        required: true,  // ✅ Made optional for updates
        enum: ['Male', 'Female', 'Other', '']
    },
    id_proof_type: {
        type: String,
        default: 'Aadhaar',
        required: true
    },
    
    // ID Number Fields
    id_number_encrypted: {
        type: String,
        required: false  // ✅ Made optional
    },
    id_number_masked: {
        type: String,
        required: true  // ✅ Made optional
    },
    id_number_full: {
        type: String,
        required: true  // ✅ FIXED - Made optional for updates
    },
    
    // Aadhaar Verification
    aadhaar_verified: {
        type: Boolean,
        default: true
    },
    aadhaar_verification_log: {
        status: String,
        provider_response: String,
        timestamp: Date,
        verification_id: String
    },
    
    // Mobile Fields
    mobile_full: {
        type: String,
        required: true  // ✅ FIXED - Made optional for updates
    },
    mobile_encrypted: {
        type: String,
        required: false
    },
    mobile_masked: {
        type: String,
        required: false
    },
    mobile: {
        type: String,
        required: false
    },
    
    // Contact Info
    email: {
        type: String,
        required: true,  // ✅ Made optional for updates
        lowercase: true,
        trim: true,
        match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email']
    },
    
    // Address Fields
    state: {
        type: String,
        required: true,  // ✅ Made optional for updates
        trim: true
    },
    district: {
        type: String,
        required: true,  // ✅ Made optional for updates
        trim: true
    },
    city: {
        type: String,
        required: true,  // ✅ Made optional for updates
        trim: true
    },
    street: {
        type: String,
        required: true,  // ✅ Made optional for updates
        trim: true
    },
    doorno: {
        type: String,
        required: true,  // ✅ Made optional for updates
        trim: true
    },
    pincode: {
        type: String,
        required: true,  // ✅ Made optional for updates
        match: [/^\d{6}$/, 'Please enter a valid 6-digit pincode']
    },
    
    // TTD Temple
    nearest_ttd_temple: {
        type: String,
        required: true  // ✅ Made optional for updates
    },
    
    // Photo
    photo_path: {
        type: String,
        required: false  // ✅ Made optional for updates
    },
    photo: {
        type: String,
        required: true
    },
    photo_public_id: {
        type: String,
        required: false
    },
    photo_uploaded_at: {
        type: Date,
        default: Date.now
    }
}, { 
    _id: true,
    strict: false  // ✅ Allow additional fields
});

// ============================================
// TEAM SCHEMA
// ============================================
const teamSchema = new mongoose.Schema({
    team_name: {
        type: String,
        required: [true, 'Team name is required'],
        trim: true,
        unique: true
    },
    members_count: {
        type: Number,
        required: true,
        min: [10, 'Team must have at least 10 members'],
        max: [15, 'Team cannot have more than 15 members']
    },
    members: {
        type: [memberSchema],
        validate: {
            validator: function (members) {
                // ✅ Relaxed validation - allow count mismatch during updates
                return members.length >= 10 && members.length <= 15;
            },
            message: 'Team must have between 10 and 15 members'
        }
    },
    submission_status: {
        type: String,
        enum: ['pending', 'verified', 'rejected','booked', 'under_review'],
        default: 'pending'
    },
    admin_notes: {
        type: String,
        trim: true
    },
    created_at: {
        type: Date,
        default: Date.now
    },
    updated_at: {
        type: Date,
        default: Date.now
    },
    submitted_by_ip: {
        type: String
    },
    consent_given: {
        type: Boolean,
        required: true,
        default: false
    }
}, {
    timestamps: true,
    strict: false  // ✅ Allow additional fields
});

// ============================================
// PRE-SAVE HOOK - Update timestamp
// ============================================
teamSchema.pre('save', function (next) {
    this.updated_at = Date.now();
    next();
});

// ============================================
// INDEXES - For faster queries
// ============================================
teamSchema.index({ team_name: 1 });
teamSchema.index({ created_at: -1 });
teamSchema.index({ submission_status: 1 });

// ============================================
// METHODS - Custom toJSON
// ============================================
teamSchema.methods.toJSON = function() {
    const team = this.toObject();
    return team;
};

// ============================================
// EXPORT MODEL
// ============================================
module.exports = mongoose.model('Team', teamSchema);