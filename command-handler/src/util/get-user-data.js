/*
    This file holds the configuration for the user data 
    that is used in the cloud init script for the VMs.
*/

export default function configUserData(serverName) {
    const userData = `
        #cloud-config
        hostname: ${serverName}
        manage_etc_hosts: true
        runcmd:
            - ['tailscale', 'up', '--authkey=${process.env.TAILSCALE_AUTH_KEY}', '--hostname=${serverName}']
            - ['tailscale', 'set', '--ssh']
            - ['tailscale', 'set', '--accept-routes']
            - ['passwd', '-d', 'root']
        users:
            - name: root
              ssh_authorized_keys:
                - ${process.env.SSH_PUBLIC_KEY}
        `
        return userData;
}