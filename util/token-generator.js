import crypto from 'crypto';

/**
 * Generates a quantum-resistant 43-character URL-safe token
 * Uses 256 bits of entropy (32 bytes) for ~128-bit post-quantum security
 * Character set: A-Z, a-z, 0-9, -, _ (base64url)
 */
export function generateCdeToken() {
    return crypto.randomBytes(32).toString('base64url');
}
