/*
    Redacts secret-bearing fields from anything before it is logged. Wired into the winston
    logger (logger.js) so NO log path can emit decrypted profile values, the encryption
    key, tokens, or the cloud-init user_data (base64 of codespace.env) — including via the
    provisioner error echo (axios-error-handler.js surfaces response bodies verbatim).

    Intentionally aggressive: over-redacting a field in an error log is acceptable; leaking
    a secret is not.
*/

// Redact any value whose key name contains one of these (case-insensitive)...
const SENSITIVE_SUBSTRINGS = [
    'secret', 'password', 'passwd', 'token', 'apikey', 'api_key', 'authkey',
    'authorization', 'credential', 'user_data', 'userdata', 'encryption_key',
    'tailscale', 'provisioner_api', 'env', 'value', 'input', 'private',
];

// ...and any string that looks like a long base64 blob (e.g. an echoed user_data payload).
const BASE64_BLOB = /^[A-Za-z0-9+/=\s]{120,}$/;
const REDACTED = '[REDACTED]';
const MAX_DEPTH = 8;

function isSensitiveKey(key) {
    const k = String(key).toLowerCase();
    return SENSITIVE_SUBSTRINGS.some(s => k.includes(s));
}

// Mutates `obj` in place, redacting sensitive fields. Circular- and depth-safe so it can't
// hang or overflow on a pathological log payload. Returns obj.
export default function redactSensitive(obj, seen = new WeakSet(), depth = 0) {
    if (!obj || typeof obj !== 'object' || seen.has(obj) || depth > MAX_DEPTH) return obj;
    seen.add(obj);
    for (const [key, value] of Object.entries(obj)) {
        if (isSensitiveKey(key)) {
            obj[key] = REDACTED;
        } else if (typeof value === 'string') {
            if (BASE64_BLOB.test(value)) obj[key] = REDACTED;
        } else if (value && typeof value === 'object') {
            redactSensitive(value, seen, depth + 1);
        }
    }
    return obj;
}
