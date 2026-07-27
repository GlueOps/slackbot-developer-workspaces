/*
    S3-backed store for per-user VM "profiles" — reusable bundles of env vars + create
    defaults that a developer can apply when creating a VM. The bot is otherwise
    stateless, so this is the one piece of durable state it owns.

    Layout: one encrypted document per user at `${PREFIX}<hmac(email)>.json`; decrypted shape:
        { "profiles": { "<name>": { env: {K:V}, region, image, instanceType, singleClick } } }

    All mutations are read-modify-write on that single per-user document. Concurrent
    edits by the same user (rare — one person, a few profiles) could race; acceptable
    for this workload and avoids standing up a locking layer.

    The S3 configuration is REQUIRED — `requireProfilesConfig()` is called at startup and
    throws if any of it is missing, so a misconfigured deploy fails fast instead of
    erroring on first use. Repo-to-clone is deliberately NOT stored — it's per-create
    (see vm-create flow).

    The entire per-user document is encrypted at rest (AES-256-GCM, see profile-crypto.js)
    using PROFILES_ENCRYPTION_KEY — profile names, env keys, and values are all opaque in
    S3. The S3 object key is a keyed hash of the email (HMAC-SHA256 with the same key), so
    the bucket reveals neither the contents nor whose profiles an object holds.
    Encryption/hashing is fully internal to this module, so callers see plaintext + email.
*/
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import logger from './logger.js';
import { encrypt, decrypt, encryptionKeyValid, hashEmail } from './profile-crypto.js';

const log = logger();

const BUCKET = process.env.PROFILES_S3_BUCKET;
const REGION = process.env.PROFILES_S3_REGION;
const ENDPOINT = process.env.PROFILES_S3_ENDPOINT || undefined;
const PREFIX = process.env.PROFILES_S3_PREFIX ?? 'profiles/';
// Bound every S3 call so an unresponsive endpoint can't hang a Slack interaction forever
// (the AWS SDK's default request timeout is 0 = unbounded). AbortSignal.timeout fires once
// at this absolute deadline, so it also caps the SDK's retries — no new dependency needed.
const S3_TIMEOUT_MS = Number(process.env.PROFILES_S3_TIMEOUT_MS) || 5000;

let client = null;

// Lazily build the client so importing this module never throws when profiles are
// disabled (no config). Credentials fall back to the default AWS provider chain
// (env/instance role) when the explicit key pair isn't set.
function getClient() {
    if (client) return client;
    const cfg = { region: REGION };
    if (ENDPOINT) {
        cfg.endpoint = ENDPOINT;
        cfg.forcePathStyle = true; // safe default for custom/S3-compatible endpoints
    }
    const accessKeyId = process.env.PROFILES_S3_ACCESS_KEY_ID;
    const secretAccessKey = process.env.PROFILES_S3_SECRET_ACCESS_KEY;
    if (accessKeyId && secretAccessKey) {
        cfg.credentials = { accessKeyId, secretAccessKey };
    }
    client = new S3Client(cfg);
    return client;
}

// Required S3 configuration. Credentials fall back to the default AWS provider chain, so
// the explicit key pair is required too (this deployment supplies static keys).
const REQUIRED_ENV = [
    'PROFILES_S3_ENDPOINT',
    'PROFILES_S3_BUCKET',
    'PROFILES_S3_REGION',
    'PROFILES_S3_ACCESS_KEY_ID',
    'PROFILES_S3_SECRET_ACCESS_KEY',
    'PROFILES_ENCRYPTION_KEY',
];

// Throws if any required config is missing or the encryption key is the wrong size. Call
// once at startup so a misconfigured deploy fails immediately with a clear message.
export function requireProfilesConfig() {
    const missing = REQUIRED_ENV.filter(k => !process.env[k]);
    if (missing.length > 0) {
        throw new Error(`Missing required profiles S3 configuration: ${missing.join(', ')}`);
    }
    if (!encryptionKeyValid()) {
        throw new Error('PROFILES_ENCRYPTION_KEY must be 32 bytes as 64 hex chars (generate with: openssl rand -hex 32)');
    }
}

// Object key = a keyed hash of the normalized email, so the filename is an opaque,
// safe-charset id that leaks neither identity nor casing/whitespace differences.
function keyFor(email) {
    return `${PREFIX}${hashEmail(email)}.json`;
}

async function streamToString(stream) {
    if (typeof stream?.transformToString === 'function') {
        return stream.transformToString(); // browser/newer runtime path
    }
    const chunks = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    return Buffer.concat(chunks).toString('utf-8');
}

// Returns the user's document, or an empty one when they have none yet. A missing
// object (NoSuchKey / 404) is the expected first-use case, not an error.
async function readUserDoc(email) {
    try {
        const res = await getClient().send(
            new GetObjectCommand({ Bucket: BUCKET, Key: keyFor(email) }),
            { abortSignal: AbortSignal.timeout(S3_TIMEOUT_MS) }
        );
        const doc = JSON.parse(decrypt(await streamToString(res.Body)));
        return doc && typeof doc === 'object' && doc.profiles && typeof doc.profiles === 'object'
            ? doc
            : { profiles: {} };
    } catch (err) {
        if (err?.name === 'NoSuchKey' || err?.name === 'NotFound' || err?.$metadata?.httpStatusCode === 404) {
            return { profiles: {} };
        }
        throw err;
    }
}

async function writeUserDoc(email, doc) {
    await getClient().send(
        new PutObjectCommand({
            Bucket: BUCKET,
            Key: keyFor(email),
            Body: encrypt(JSON.stringify(doc)),
            ContentType: 'text/plain',
        }),
        { abortSignal: AbortSignal.timeout(S3_TIMEOUT_MS) }
    );
}

// Returns { name: profile } for the user (empty object if none / on read failure — a
// failure here should degrade to "no profiles", never block VM creation).
export async function listProfiles(email) {
    try {
        return (await readUserDoc(email)).profiles;
    } catch (err) {
        log.error('Failed to list profiles from S3', err);
        return {};
    }
}

export async function getProfile(email, name) {
    const doc = await readUserDoc(email);
    return doc.profiles[name] || null;
}

export async function saveProfile(email, name, profile) {
    const doc = await readUserDoc(email);
    doc.profiles[name] = profile;
    await writeUserDoc(email, doc);
}

export async function deleteProfile(email, name) {
    const doc = await readUserDoc(email);
    if (doc.profiles[name]) {
        delete doc.profiles[name];
        await writeUserDoc(email, doc);
    }
}
