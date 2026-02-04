import crypto from 'crypto';

/**
 * Generates a 43-character random token with only alphanumeric characters
 * Generates 22 random bytes (176 bits) and encodes as hex, retaining 172 bits after truncation
 * Character set: 0-9, a-f (hex)
 */
export function generateCdeToken() {
    return crypto.randomBytes(22).toString('hex').slice(0, 43);
}
