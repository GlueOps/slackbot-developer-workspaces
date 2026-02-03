import crypto from 'crypto';

/**
 * Generates a 43-character random token with only alphanumeric characters
 * Uses 172 bits of entropy (22 bytes), encoded as hex and truncated
 * Character set: 0-9, a-f (hex)
 */
export function generateCdeToken() {
    return crypto.randomBytes(22).toString('hex').slice(0, 43);
}
