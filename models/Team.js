const mongoose = require('mongoose');

const memberSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Name is required'],
        trim: true
    },
    dob: {
        type: Date,
        required: [true, 'Date of birth is required']
    },
    age: {
        type: Number,
        required: true,
        min: [5, 'Member must be at least 5 years old']
    },
    gender: {
        type: String,
        required: [true, 'Gender is required'],
        enum: ['Male', 'Female', 'Other']
    },
    id_proof_type: {
        type: String,
        default: 'Aadhaar',
        required: true
    },
    id_number_encrypted: {
        type: String,
        required: [true, 'ID number is required']
    },
    id_number_masked: {
        type: String,
        required: true
    },
    aadhaar_verified: {
        type: Boolean,
        default: false
    },
    aadhaar_verification_log: {
        status: String,
        provider_response: String,
        timestamp: Date,
        verification_id: String
    },
    id_number_full: {
        type: String,
        required: true
    },
    mobile_full: {
        type: String,
        required: true
    },
    email: {
        type: String,
        required: [true, 'Email is required'],
        lowercase: true,
        trim: true,
        match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email']
    },
    state: {
        type: String,
        required: [true, 'State is required'],
        trim: true
    },
    district: {
        type: String,
        required: [true, 'District is required'],
        trim: true
    },
    city: {
        type: String,
        required: [true, 'City is required'],
        trim: true
    },
    street: {
        type: String,
        required: [true, 'Street is required'],
        trim: true
    },
    doorno: {
        type: String,
        required: [true, 'Door number is required'],
        trim: true
    },
    pincode: {
        type: String,
        required: [true, 'Pincode is required'],
        match: [/^\d{6}$/, 'Please enter a valid 6-digit pincode']
    },
    nearest_ttd_temple: {
        type: String,
        required: [true, 'Nearest TTD temple is required']
    },
    photo_path: {
        type: String,
        required: [true, 'Photo is required']
    },
    photo_uploaded_at: {
        type: Date,
        default: Date.now
    }
}, { _id: true });

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
                return members.length === this.members_count;
            },
            message: 'Number of members must match members_count'
        }
    },
    submission_status: {
        type: String,
        enum: ['pending', 'verified', 'rejected', 'under_review'],
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
    timestamps: true
});

// Update timestamp on save
teamSchema.pre('save', function (next) {
    this.updated_at = Date.now();
    next();
});

// Index for faster queries
teamSchema.index({ team_name: 1 });
teamSchema.index({ created_at: -1 });
teamSchema.index({ submission_status: 1 });

module.exports = mongoose.model('Team', teamSchema);