import crypto from 'crypto';

/**
 * Generates a 43-character URL-safe random token
 * Uses 256 bits of entropy (32 bytes), encoded as base64url
 * Character set: A-Z, a-z, 0-9, -, _ (base64url)
 */
export function generateCdeToken() {
    return crypto.randomBytes(32).toString('base64url');
}
