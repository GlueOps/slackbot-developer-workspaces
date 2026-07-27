/*
    S3-backed store for per-user VM "profiles" — reusable bundles of env vars + create
    defaults that a developer can apply when creating a VM. The bot is otherwise
    stateless, so this is the one piece of durable state it owns.

    Layout: one JSON document per user at `${PREFIX}<email>.json`, shape:
        { "profiles": { "<name>": { env: {K:V}, region, image, instanceType, singleClick } } }

    All mutations are read-modify-write on that single per-user document. Concurrent
    edits by the same user (rare — one person, a few profiles) could race; acceptable
    for this workload and avoids standing up a locking layer.

    The feature is OPTIONAL: with no bucket configured, `profilesEnabled()` is false and
    the UI simply omits the profile picker. Repo-to-clone is deliberately NOT stored —
    it's per-create (see vm-create flow).
*/
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import logger from './logger.js';

const log = logger();

const BUCKET = process.env.PROFILES_S3_BUCKET;
const REGION = process.env.PROFILES_S3_REGION;
const ENDPOINT = process.env.PROFILES_S3_ENDPOINT || undefined;
const PREFIX = process.env.PROFILES_S3_PREFIX ?? 'profiles/';

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

export function profilesEnabled() {
    return Boolean(BUCKET && REGION);
}

// Email is URL-encoded so characters like '+' in a plus-addressed address can't produce
// a surprising key; lowercased so the key matches regardless of how Slack cases it.
function keyFor(email) {
    return `${PREFIX}${encodeURIComponent(String(email).toLowerCase())}.json`;
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
        const res = await getClient().send(new GetObjectCommand({ Bucket: BUCKET, Key: keyFor(email) }));
        const doc = JSON.parse(await streamToString(res.Body));
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
    await getClient().send(new PutObjectCommand({
        Bucket: BUCKET,
        Key: keyFor(email),
        Body: JSON.stringify(doc),
        ContentType: 'application/json',
    }));
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
