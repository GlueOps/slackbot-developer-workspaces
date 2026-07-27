/*
    Encrypts the profile store at rest in S3. The whole per-user JSON document is
    encrypted as one blob, so profile names, env keys, and values are all opaque in S3.

    Scheme: AES-256-GCM with a random 12-byte IV and the GCM auth tag, so a wrong key or
    any tampering fails loudly on decrypt. The key is supplied via the
    PROFILES_ENCRYPTION_KEY env var as 64 hex chars (32 bytes). Generate one with:

        openssl rand -hex 32

    Ciphertext is stored as "v1.<ivHex>.<tagHex>.<ciphertextHex>".
*/
import crypto from 'crypto';

const ALGO = 'aes-256-gcm';
const KEY_BYTES = 32; // AES-256
const IV_BYTES = 12;  // GCM standard nonce

// Returns the 32-byte key from PROFILES_ENCRYPTION_KEY (hex). Throws if missing/malformed.
function getKey() {
    const key = Buffer.from(process.env.PROFILES_ENCRYPTION_KEY || '', 'hex');
    if (key.length !== KEY_BYTES) {
        throw new Error('PROFILES_ENCRYPTION_KEY must be 32 bytes as 64 hex chars (generate with: openssl rand -hex 32)');
    }
    return key;
}

// True when the configured key is present and correctly sized. Used by startup validation.
export function encryptionKeyValid() {
    try {
        getKey();
        return true;
    } catch {
        return false;
    }
}

// Encrypt a string → "v1.<ivHex>.<tagHex>.<ctHex>".
export function encrypt(plaintext) {
    const iv = crypto.randomBytes(IV_BYTES);
    const cipher = crypto.createCipheriv(ALGO, getKey(), iv);
    const ct = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `v1.${iv.toString('hex')}.${tag.toString('hex')}.${ct.toString('hex')}`;
}

// Inverse of encrypt. Throws on a wrong key or tampered ciphertext (GCM auth).
export function decrypt(packed) {
    const parts = String(packed).split('.');
    if (parts.length !== 4 || parts[0] !== 'v1') {
        throw new Error('Malformed ciphertext');
    }
    const [, ivHex, tagHex, ctHex] = parts;
    const decipher = crypto.createDecipheriv(ALGO, getKey(), Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    return Buffer.concat([decipher.update(Buffer.from(ctHex, 'hex')), decipher.final()]).toString('utf8');
}

// Deterministic, keyed, one-way id for a user's S3 object filename. HMAC-SHA256 keyed
// with PROFILES_ENCRYPTION_KEY, so the email→filename mapping can't be computed without
// the key (a bucket reader can't tell whose profiles an object holds). The email is
// normalized (trimmed + lowercased) so a Slack casing/whitespace change yields the same
// id. Returns 64 hex chars.
export function hashEmail(email) {
    const normalized = String(email ?? '').trim().toLowerCase();
    // Reject a missing/implausible email BEFORE it becomes an object id. Without this,
    // `undefined`/`''` would hash to a single shared document that every affected user
    // (dropped users:read.email scope, external Slack Connect user, guest with no email)
    // could read and write — a silent cross-user secret merge.
    if (!normalized || !normalized.includes('@')) {
        throw new Error('Cannot derive profile id: no email for this Slack user');
    }
    return crypto.createHmac('sha256', getKey()).update(normalized).digest('hex');
}
