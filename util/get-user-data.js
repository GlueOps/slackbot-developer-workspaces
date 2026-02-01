/*
    This file holds the configuration for the user data 
    that is used in the cloud init script for the VMs.
*/

export default function configUserData(serverName, cdeToken = null) {
    let userData = `
        #cloud-config
        hostname: ${serverName}
        manage_etc_hosts: true
        runcmd:
            - ['tailscale', 'up', '--authkey=${process.env.TAILSCALE_AUTH_KEY}', '--hostname=${serverName}']
            - ['tailscale', 'set', '--ssh']
            - ['tailscale', 'set', '--accept-routes']
            - ['passwd', '-d', 'root']`;

    // If CDE token is provided, write it to disk and run startup commands
    if (cdeToken) {
        userData += `
            - ['mkdir', '-p', '/etc/glueops']
            - ['bash', '-c', 'echo "${cdeToken}" > /etc/glueops/cde_token && chmod 644 /etc/glueops/cde_token']
            - ['su', '-', 'vscode', '-c', 'source ~/.glueopsrc; dev || true']`;
    }

    return userData;
}
