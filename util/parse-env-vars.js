/*
    Parses the free-form "Environment variables" textarea from the VM create modal
    into a { KEY: VALUE } object. Format: one KEY=VALUE per line. Blank lines and
    lines beginning with '#' (comments) are ignored.

    Returns { env, errors }. `errors` lists the 1-indexed lines that could not be
    parsed, so the view handler can reject the modal with inline feedback instead of
    silently dropping a var (a dropped secret is an hour of debugging in the VM).

    This layer only validates structure and key shape. Value sanitisation — control
    chars, length bounds, docker env-file line safety — happens downstream in
    get-user-data.js (envValue), which is the single place that guards the env-file
    contract, so we deliberately don't duplicate it here.
*/

// Same key shape get-user-data.js accepts. The GLUEOPS_CDE_ namespace is reserved
// for platform-written metadata, so user keys there are rejected rather than allowed
// to collide with SERVER_NAME/REGION/CLONE_REPO/etc.
const KEY_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
const RESERVED_RE = /^GLUEOPS_CDE_/;

export default function parseEnvVars(text) {
    const env = {};
    const errors = [];
    if (!text) return { env, errors };

    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
        const lineNo = i + 1;
        const line = lines[i].trim();
        if (line === '' || line.startsWith('#')) continue;

        const eq = line.indexOf('=');
        if (eq === -1) {
            errors.push(`Line ${lineNo}: missing "=" (expected KEY=VALUE)`);
            continue;
        }

        const key = line.slice(0, eq).trim();
        // Value kept exactly as typed (quotes included; trimmed downstream). docker
        // --env-file treats the value literally, so if a user writes quotes they get quotes.
        const value = line.slice(eq + 1);

        if (!KEY_RE.test(key)) {
            errors.push(`Line ${lineNo}: invalid key "${key}" (use letters, digits, underscore; not starting with a digit)`);
            continue;
        }
        if (RESERVED_RE.test(key)) {
            errors.push(`Line ${lineNo}: keys starting with GLUEOPS_CDE_ are reserved`);
            continue;
        }

        env[key] = value;
    }

    return { env, errors };
}
