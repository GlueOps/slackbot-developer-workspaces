/*
    This file holds the configuration for the user data
    that is used in the cloud init script for the VMs.
*/

export default function configUserData(serverName, cdeToken = null, cdeEnv = {}) {
    let userData = `
        #cloud-config
        hostname: ${serverName}
        manage_etc_hosts: true
        runcmd:
            - ['passwd', '-d', 'root']
            - ['tailscale', 'up', '--authkey=${process.env.TAILSCALE_AUTH_KEY}', '--hostname=${serverName}']
            - ['tailscale', 'set', '--ssh']
            - ['tailscale', 'set', '--accept-routes']`;

    // If CDE token is provided, write it to disk and run startup commands
    if (cdeToken) {
        userData += `
            - ['mkdir', '-p', '/etc/glueops']
            - ['bash', '-c', 'echo "${cdeToken}" > /etc/glueops/cde_token && chmod 644 /etc/glueops/cde_token']
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
    // docker env-file (`Object.entries(cdeEnv ?? {})` also guards null/undefined).
    const envEntries = Object.entries(cdeEnv ?? {})
        .map(([key, value]) => [key, value == null ? '' : envValue(value)])
        .filter(([key, value]) => value !== '' && /^[A-Za-z_][A-Za-z0-9_]*$/.test(key));
    if (envEntries.length > 0) {
        const envFileBody = envEntries
            .map(([key, value]) => `GLUEOPS_CDE_${key}=${value}`)
            .join('\n') + '\n';
        const envFileB64 = Buffer.from(envFileBody).toString('base64');

        // content is single-quoted for defence-in-depth: base64 never contains a
        // single quote, so this can't need escaping, and it removes any chance of
        // YAML implicit-tag resolution on the scalar.
        userData += `
        write_files:
            - path: /etc/glueops/codespace.env
              owner: 'root:root'
              permissions: '0600'
              encoding: b64
              content: '${envFileB64}'`;
    }

    return userData;
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
