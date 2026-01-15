/**
 * Aadhaar Validation Utilities
 * Implements Verhoeff algorithm for checksum validation
 */

// Verhoeff algorithm multiplication table
const d = [
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
    [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
    [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
    [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
    [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
    [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
    [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
    [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
    [9, 8, 7, 6, 5, 4, 3, 2, 1, 0]
];

// Verhoeff algorithm permutation table
const p = [
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
    [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
    [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
    [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
    [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
    [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
    [7, 0, 4, 6, 9, 1, 3, 2, 5, 8]
];

/**
 * Validate Aadhaar number using Verhoeff algorithm
 * @param {string} aadhaar - Aadhaar number to validate
 * @returns {object} Validation result
 */
function validateAadhaar(aadhaar) {
    // Remove spaces and whitespace
    aadhaar = String(aadhaar).replace(/\s/g, '');

    // Check if empty
    if (!aadhaar) {
        return {
            valid: false,
            message: 'Aadhaar number is required'
        };
    }

    // Check length
    if (aadhaar.length !== 12) {
        return {
            valid: false,
            message: 'Aadhaar must be exactly 12 digits'
        };
    }

    // Check if all digits
    if (!/^\d{12}$/.test(aadhaar)) {
        return {
            valid: false,
            message: 'Aadhaar must contain only digits'
        };
    }

    // Check for known fake patterns

    // All same digits (e.g., 111111111111)
    if (/^(\d)\1{11}$/.test(aadhaar)) {
        return {
            valid: false,
            message: 'Invalid Aadhaar pattern (all same digits)'
        };
    }

    // Sequential patterns
    if (aadhaar === '123456789012' ||
        aadhaar === '012345678901' ||
        aadhaar === '098765432109' ||
        aadhaar === '111111111111' ||
        aadhaar === '000000000000') {
        return {
            valid: false,
            message: 'Invalid Aadhaar pattern (sequential or test number)'
        };
    }

    // First digit cannot be 0 or 1 (UIDAI rule)
    if (aadhaar[0] === '0' || aadhaar[0] === '1') {
        return {
            valid: false,
            message: 'Invalid Aadhaar format (cannot start with 0 or 1)'
        };
    }

    // Verhoeff checksum validation
    if (!verhoeffValidate(aadhaar)) {
        return {
            valid: false,
            message: 'Invalid Aadhaar checksum (Verhoeff algorithm failed)'
        };
    }

    return {
        valid: true,
        message: 'Valid Aadhaar number'
    };
}

/**
 * Verhoeff checksum validation
 * @param {string} num - Number to validate
 * @returns {boolean} True if valid checksum
 */
function verhoeffValidate(num) {
    let c = 0;
    const myArray = num.split('').reverse();

    for (let i = 0; i < myArray.length; i++) {
        c = d[c][p[(i % 8)][parseInt(myArray[i])]];
    }

    return c === 0;
}

/**
 * Generate Verhoeff checksum digit
 * @param {string} num - Number without checksum
 * @returns {string} Checksum digit
 */
function verhoeffGenerate(num) {
    let c = 0;
    const myArray = num.split('').reverse();

    for (let i = 0; i < myArray.length; i++) {
        c = d[c][p[((i + 1) % 8)][parseInt(myArray[i])]];
    }

    return String((10 - c) % 10);
}

/**
 * Mask Aadhaar number (show only last 4 digits)
 * @param {string} aadhaar - Aadhaar number
 * @param {number} visibleDigits - Number of digits to show (default: 4)
 * @returns {string} Masked Aadhaar
 */
function maskAadhaar(aadhaar, visibleDigits = 4) {
    if (!aadhaar) return '';
    aadhaar = String(aadhaar).replace(/\s/g, '');

    if (aadhaar.length < visibleDigits) {
        return '*'.repeat(aadhaar.length);
    }

    const masked = '*'.repeat(aadhaar.length - visibleDigits);
    return masked + aadhaar.slice(-visibleDigits);
}

/**
 * Format Aadhaar with spaces (XXXX XXXX XXXX)
 * @param {string} aadhaar - Aadhaar number
 * @returns {string} Formatted Aadhaar
 */
function formatAadhaar(aadhaar) {
    if (!aadhaar) return '';
    aadhaar = String(aadhaar).replace(/\s/g, '');

    if (aadhaar.length !== 12) return aadhaar;

    return aadhaar.match(/.{1,4}/g).join(' ');
}

module.exports = {
    validateAadhaar,
    verhoeffValidate,
    verhoeffGenerate,
    maskAadhaar,
    formatAadhaar
};