/*
    This file holds the configuration for the user data
    that is used in the cloud init script for the VMs.
*/

// Bare-hostname shape for a sish tunnel endpoint (no scheme, port, path, or
// userinfo). Shared with libvirt-server.js, which validates at resolution
// time: every consumer of the value (permanent VM tag, access URLs, the
// cloud-init file write below) must accept or reject it identically, or a VM
// ends up tunneled to one host while its advertised URLs point at another.
export const TUNNEL_ENDPOINT_PATTERN = /^[a-z0-9][a-z0-9.-]*$/i;

export default function configUserData(serverName, cdeToken = null, cdeEnv = {}, userEnv = {}) {
    const otelEnvBody = otelEnvFile(cdeEnv);
    let userData = `
        #cloud-config
        hostname: ${serverName}
        manage_etc_hosts: true
        runcmd:
            - ['passwd', '-d', 'root']
            - ['tailscale', 'up', '--authkey=${process.env.TAILSCALE_AUTH_KEY}', '--hostname=${serverName}']
            - ['tailscale', 'set', '--ssh']
            - ['tailscale', 'set', '--accept-routes']`;

    // Metrics: the codespaces image ships otelcol-contrib gated on /etc/glueops/otel.env
    // (ConditionPathExists), written below. write_files lands before runcmd and the unit is
    // ordered after cloud-init's config stage, so this start is belt-and-braces for the
    // first boot; `|| true` keeps it a no-op on images that predate the unit.
    if (otelEnvBody) {
        userData += `
            - ['bash', '-c', 'systemctl start otelcol-contrib || true']`;
    }

    // If CDE token is provided, write it to disk and run startup commands
    if (cdeToken) {
        userData += `
            - ['mkdir', '-p', '/etc/glueops']
            - ['bash', '-c', 'echo "${cdeToken}" > /etc/glueops/cde_token && chmod 644 /etc/glueops/cde_token']`;

        // Regional sish endpoint, world-readable like cde_token because the
        // host-side dev() (developer-setup.sh) reads it as the vscode user —
        // codespace.env is root-only so it can't serve this. Absent file ->
        // dev() falls back to the legacy central tunnel, which is also why the
        // hostname is re-validated here (defence-in-depth; the resolver
        // already enforced it): a value that can't round-trip safely through
        // this runcmd is dropped rather than escaped.
        const tunnelEndpoint = cdeEnv?.TUNNEL_ENDPOINT;
        if (tunnelEndpoint && TUNNEL_ENDPOINT_PATTERN.test(tunnelEndpoint)) {
            userData += `
            - ['bash', '-c', 'echo "${tunnelEndpoint}" > /etc/glueops/tunnel_endpoint && chmod 644 /etc/glueops/tunnel_endpoint']`;
        }

        userData += `
            - ['su', '-', 'vscode', '-c', 'source ~/.glueopsrc; dev || true']`;
    }

    // Write the workspace metadata we already have (server name, region, etc.) to
    // /etc/glueops/codespace.env as GLUEOPS_CDE_* variables. The GlueOps codespaces
    // setup consumes this file via `docker run --env-file` (see GlueOps/codespaces
    // developer-setup.sh), so it must be in docker env-file format: bare KEY=VALUE,
    // one per line, no quoting (docker does NOT strip quotes — they'd become part of
    // the value). Values are sanitised of newlines because the format is line-oriented.
    //
    // write_files creates /etc/glueops if absent and sets mode 0600 atomically; owner
    // is root because `sudo docker run --env-file` reads it as root, matching how
    // developer-setup.sh provisions the file. encoding: b64 keeps arbitrary characters
    // from breaking the surrounding cloud-config YAML.
    // Sanitise first, then drop empties and any structurally invalid keys, so a
    // whitespace-only value or a malformed key can't emit a line that breaks the
    // docker env-file (`Object.entries(... ?? {})` also guards null/undefined).
    //
    // Two namespaces share the one env-file: platform metadata (SERVER_NAME, REGION,
    // CLONE_REPO, ...) is prefixed GLUEOPS_CDE_ so it never collides with a dev's own
    // vars; user-supplied vars are written VERBATIM because the whole point is that the
    // dev's app reads GITHUB_TOKEN, not GLUEOPS_CDE_GITHUB_TOKEN. The GLUEOPS_CDE_
    // prefix is therefore reserved for the platform: user keys in that namespace are
    // dropped so they can't clobber metadata (the modal already rejects them upstream,
    // this is defence-in-depth).
    const metadataLines = envLines(cdeEnv, 'GLUEOPS_CDE_');
    const userLines = envLines(userEnv, '', /^GLUEOPS_CDE_/);
    const allLines = [...metadataLines, ...userLines];
    const writeFiles = [];
    if (allLines.length > 0) {
        writeFiles.push(['/etc/glueops/codespace.env', allLines.join('\n') + '\n']);
    }

    // /etc/glueops/otel.env — the systemd EnvironmentFile that turns the image's metrics
    // collector on and tells it which VM it is. Contract documented in GlueOps/codespaces,
    // README "VM metrics". Root-only like codespace.env: PID 1 reads it, nothing else needs to.
    if (otelEnvBody) {
        writeFiles.push(['/etc/glueops/otel.env', otelEnvBody]);
    }

    if (writeFiles.length > 0) {
        userData += `
        write_files:`;
        for (const [path, body] of writeFiles) {
            // content is single-quoted for defence-in-depth: base64 never contains a
            // single quote, so this can't need escaping, and it removes any chance of
            // YAML implicit-tag resolution on the scalar.
            const b64 = Buffer.from(body).toString('base64');
            userData += `
            - path: ${path}
              owner: 'root:root'
              permissions: '0600'
              encoding: b64
              content: '${b64}'`;
        }
    }

    return userData;
}

// Base URL of the OTLP/HTTP collector the VM ships metrics to; the exporter appends /v1/metrics.
// Bare scheme+host[:port][/path], nothing that could break out of a KEY=VALUE env-file line.
const OTEL_ENDPOINT_PATTERN = /^https?:\/\/[^\s"'\\]+$/;
// One value inside OTEL_RESOURCE_ATTRIBUTES ("k=v,k=v"). ',' and '=' are the separators and
// '%' would be read as an escape, so a value carrying any of them — or whitespace, which the
// env file would need quoting for — is dropped rather than escaped, the same policy as
// TUNNEL_ENDPOINT above: one bad attribute must not cost the VM its metrics.
const OTEL_ATTR_VALUE_PATTERN = /^[^\s,=%\x00-\x1f\x7f]+$/;

// Body of /etc/glueops/otel.env, or null when metrics are not configured for this bot
// (OTEL_EXPORTER_OTLP_ENDPOINT unset) — in which case no file is written and the VM's
// collector stays inert. The endpoint is not a secret (write-only, no auth), and the
// attributes are the metadata already written to codespace.env, so nothing here needs
// redaction.
export function otelEnvFile(cdeEnv = {}) {
    const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT?.trim();
    if (!endpoint || !OTEL_ENDPOINT_PATTERN.test(endpoint)) {
        return null;
    }
    // host.name is deliberately absent: the collector takes it from the VM hostname, which
    // cloud-init sets to the server name.
    const attributes = {
        'cloud.region': cdeEnv?.REGION,
        'host.type': cdeEnv?.INSTANCE_TYPE,
        'host.image.name': cdeEnv?.IMAGE,
        'deployment.environment.name': process.env.APP_ENVIRONMENT,
        'glueops.cde.owner': cdeEnv?.OWNER,
    };
    const pairs = Object.entries(attributes)
        .filter(([, value]) => value != null && OTEL_ATTR_VALUE_PATTERN.test(String(value)))
        .map(([key, value]) => `${key}=${value}`);
    let body = `OTEL_EXPORTER_OTLP_ENDPOINT=${endpoint}\n`;
    if (pairs.length > 0) {
        body += `OTEL_RESOURCE_ATTRIBUTES=${pairs.join(',')}\n`;
    }
    return body;
}

// Turn an object into sanitised `PREFIX+KEY=VALUE` env-file lines. Drops entries whose
// value sanitises to empty, whose key isn't a valid env identifier, or (when
// reservedKeyPattern is given) whose key falls in a namespace reserved for another
// writer — each such line could otherwise break the docker env-file or clobber a var.
function envLines(obj, prefix, reservedKeyPattern = null) {
    return Object.entries(obj ?? {})
        .map(([key, value]) => [key, value == null ? '' : envValue(value)])
        .filter(([key, value]) =>
            value !== '' &&
            /^[A-Za-z_][A-Za-z0-9_]*$/.test(key) &&
            !(reservedKeyPattern && reservedKeyPattern.test(key)))
        .map(([key, value]) => `${prefix}${key}=${value}`);
}

// Render a value for a docker env-file line. docker's --env-file is line-oriented and
// does not process quotes, so we emit the value bare. Sanitisation guards the env-file
// contract: CR/LF are collapsed to a space (a newline would inject an extra line, or
// hard-fail `docker run` if the injected line has no key), remaining C0 control chars and
// DEL are stripped (a NUL byte makes the container refuse to start), and the value is
// bounded well under docker's 64 KiB per-line scanner limit. Today's callers pass only
// bounded, control-free values, but the profiles feature will feed this user input.
function envValue(value) {
    return String(value)
        .replace(/[\r\n]+/g, ' ')
        .replace(/[\x00-\x08\x0b-\x1f\x7f]/g, '')
        .trim()
        .slice(0, 4096);
}
