export default function configUserData(serverName) {
    const userData = `
        #cloud-config
        runcmd:
            - ['tailscale', 'up', '--authkey=${process.env.TAILSCALE_AUTH_KEY}', '--hostname=${serverName}']
            - ['tailscale', 'set', '--ssh']
            - ['tailscale', 'set', '--accept-routes']
            - ['passwd', '-d', 'root']
        `
        return userData;
}