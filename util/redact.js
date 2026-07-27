/*
    Redacts secret-bearing fields from anything before it is logged. Wired into the winston
    logger (logger.js) so NO log path can emit decrypted profile values, the encryption
    key, tokens, or the cloud-init user_data (base64 of codespace.env) — including via the
    provisioner error echo (axios-error-handler.js surfaces response bodies verbatim).

    Intentionally aggressive: over-redacting a field in an error log is acceptable; leaking
    a secret is not. Two defensive choices worth calling out:
      - It returns a redacted COPY and never mutates the caller's object — logging a live
        object (e.g. VM tags) must not blank that object's fields in the running app.
      - It fails CLOSED: past MAX_DEPTH, or on any value it can't safely walk, it redacts
        rather than passing raw data through.
*/

// Redact any value whose key name contains one of these (case-insensitive)...
const SENSITIVE_SUBSTRINGS = [
    'secret', 'password', 'passwd', 'token', 'apikey', 'api_key', 'access_key', 'authkey',
    'authorization', 'credential', 'user_data', 'userdata', 'encryption_key',
    'tailscale', 'provisioner_api', 'env', 'value', 'input', 'private',
    'header', 'request', 'setup_script',
];

// ...and any run that looks like a long base64 blob (e.g. an echoed user_data payload),
// wherever it appears in a string — not just when the whole string is base64.
const BASE64_BLOB = /[A-Za-z0-9+/]{120,}={0,2}/g;
const REDACTED = '[REDACTED]';
const MAX_DEPTH = 8;

function isSensitiveKey(key) {
    const k = String(key).toLowerCase();
    return SENSITIVE_SUBSTRINGS.some(s => k.includes(s));
}

function scrubString(str) {
    return str.replace(BASE64_BLOB, REDACTED);
}

// Returns a redacted copy of `obj`. Circular-safe (via a WeakMap of original→copy) and
// depth-safe. Does not mutate the input.
export default function redactSensitive(obj, seen = new WeakMap(), depth = 0) {
    if (typeof obj === 'string') return scrubString(obj);
    if (!obj || typeof obj !== 'object') return obj;   // numbers, booleans, null, functions
    if (depth > MAX_DEPTH) return REDACTED;            // fail closed rather than pass through
    if (seen.has(obj)) return seen.get(obj);

    if (Array.isArray(obj)) {
        const out = [];
        seen.set(obj, out);
        for (const item of obj) out.push(redactSensitive(item, seen, depth + 1));
        return out;
    }

    const out = {};
    seen.set(obj, out);
    for (const [key, value] of Object.entries(obj)) {
        out[key] = isSensitiveKey(key) ? REDACTED : redactSensitive(value, seen, depth + 1);
    }
    return out;
}
