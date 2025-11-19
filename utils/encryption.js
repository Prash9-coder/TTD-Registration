const crypto = require('crypto');

// Get encryption key from environment
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'default-key-change-this-12345'; // Must be 32 characters
const IV_LENGTH = 16; // For AES, this is always 16

// Ensure key is 32 bytes
const getKey = () => {
    const key = Buffer.from(ENCRYPTION_KEY.padEnd(32, '0').slice(0, 32));
    return key;
};

/**
 * Encrypt sensitive data using AES-256-GCM
 * @param {string} text - Text to encrypt
 * @returns {string} Encrypted text in format: iv:encryptedData:authTag
 */
function encrypt(text) {
    try {
        if (!text) return '';

        const iv = crypto.randomBytes(IV_LENGTH);
        const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv);

        let encrypted = cipher.update(text, 'utf8', 'hex');
        encrypted += cipher.final('hex');

        const authTag = cipher.getAuthTag();

        // Return format: iv:encrypted:authTag (all in hex)
        return iv.toString('hex') + ':' + encrypted + ':' + authTag.toString('hex');
    } catch (error) {
        console.error('Encryption error:', error);
        throw new Error('Failed to encrypt data');
    }
}

/**
 * Decrypt encrypted data
 * @param {string} encryptedText - Encrypted text in format: iv:encryptedData:authTag
 * @returns {string} Decrypted text
 */
function decrypt(encryptedText) {
    try {
        if (!encryptedText) return '';

        const parts = encryptedText.split(':');
        if (parts.length !== 3) {
            throw new Error('Invalid encrypted data format');
        }

        const iv = Buffer.from(parts[0], 'hex');
        const encrypted = parts[1];
        const authTag = Buffer.from(parts[2], 'hex');

        const decipher = crypto.createDecipheriv('aes-256-gcm', getKey(), iv);
        decipher.setAuthTag(authTag);

        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');

        return decrypted;
    } catch (error) {
        console.error('Decryption error:', error);
        throw new Error('Failed to decrypt data');
    }
}

/**
 * Hash data using SHA-256 (one-way, for comparison only)
 * @param {string} text - Text to hash
 * @returns {string} Hashed text
 */
function hash(text) {
    return crypto.createHash('sha256').update(text).digest('hex');
}

/**
 * Generate random encryption key
 * @returns {string} Random 32-character key
 */
function generateKey() {
    return crypto.randomBytes(32).toString('hex').slice(0, 32);
}

module.exports = {
    encrypt,
    decrypt,
    hash,
    generateKey
};