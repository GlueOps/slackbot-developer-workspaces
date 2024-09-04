import logger from './logger.js';
import axios from 'axios';
import 'dotenv/config';
import formatUser from './format-user.js';
import getDevices from './get-devices-info.js';
import getServer from './get-servers.js';
import axiosError from './axios-error-handler.js';
import { uniqueNamesGenerator, colors, animals } from 'unique-names-generator';

const log = logger();

const delay = (ms) => {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
const region = "hel1";
const userData = `#cloud-config\nruncmd:\n  - ['sh', '-c', 'curl -fsSL https://tailscale.com/install.sh | sh']\n  - ['tailscale', 'up', '--authkey=${process.env.TAILSCALE_AUTH_KEY}']\n  - ['tailscale', 'set', '--ssh']\n  - ['tailscale', 'set', '--accept-routes']\n  - ['passwd', '-d', 'root']`

export default {
    //create the hetzner server
    createServer: async ({ app, body }) => {
        //auto generate the name
    const serverName = uniqueNamesGenerator({ 
        dictionaries: [colors, animals ],
        separator: '-'
      });

      // Call the users.info method using the WebClient
      const info = await app.client.users.info({
        user: body.user.id
      })
      .catch(error => {
        log.error('There was an error calling the user.info method in slack', error);
      });

      const userEmail = formatUser(info.user.profile.email);
      
      //hetzner api to create the server
      await axios.post('https://api.hetzner.cloud/v1/servers', 
        {
          "automount": false,
          "image": "debian-12",
          "labels": {
            "owner": `${userEmail}`
          },
          "location": `${region}`,
          "name": `${serverName}`,
          "public_net": {
            "enable_ipv4": true,
            "enable_ipv6": false
          },
          "server_type": "cx42",
          "start_after_create": true,
          "user_data": userData
        }, {
        headers: {
          'Authorization': `Bearer ${process.env.HETZNER_API_TOKEN}`,
          'Content-Type': 'application/json'
        }
      })
      .catch(error => {
        log.error('There was an error creating the server', axiosError(error));
      });

      //set 2 minute delay
      await delay(1000 * 60 * 2);

      //get servers and info from tailscale
      const { deviceId, deviceIP } = await getDevices(serverName);

      //set tag in tailscale
      await axios.post(`https://api.tailscale.com/api/v2/device/${deviceId}/tags`, 
        {
          "tags": [
            `tag:${userEmail}`
          ]
        }, {
        headers: {
          'Authorization': `Bearer ${process.env.TAILSCALE_API_TOKEN}`,
          'Content-Type': 'application/json'
        }
      })
        .catch(error => {
          log.error('There was an error setting tags in tailscale', axiosError(error));
      });
      //return info for tailscale
      app.client.chat.postEphemeral({
        channel: `${body.channel.id}`,
        user: `${body.user.id}`,
        text: `The server has been created: https://login.tailscale.com/admin/machines/${deviceIP}`
      });
    },

    //delete a hetzner server
    deleteServer: async ({ app, body, serverName }) => {
        //get server from hetzner
        const data = await getServer();

        //get servers from tailscale
        const { deviceId } = await getDevices(serverName)
        
        
        //get server id from hetzner
        let vmid = null
        for (const server of data.data.servers) {
          if (server.name === serverName) {
            vmid = server.id;
          }
        }

        //delete the device from tailscale
        await axios.delete(`https://api.tailscale.com/api/v2/device/${deviceId}`, {
          headers: {
            'Authorization': `Bearer ${process.env.TAILSCALE_API_TOKEN}`
          }
        })
        .catch(error => {
          log.error('Failed to delete device in tailscale', axiosError(error));
        });

        //delete server from hetzner
        await axios.delete(`https://api.hetzner.cloud/v1/servers/${vmid}`, {
          headers: {
            'Authorization': `Bearer ${process.env.HETZNER_API_TOKEN}`
          }
        })
        .catch(error => {
          log.error('Failed to delete the server in hetzner', axiosError(error));
        });

        app.client.chat.postEphemeral({
          channel: `${body.channel.id}`,
          user: `${body.user.id}`,
          text: `Server: ${serverName} has been deleted.`
        });
    },

    //list the servers
    listServers: async ({ app, body }) => {
        const data = await getServer();

        // Call the users.info method using the WebClient
        const info = await app.client.users.info({
        user: body.user.id
        })
        .catch(error => {
        log.error('There was an error getting user.info from slack', error);
        });

        const userEmail = formatUser(info.user.profile.email);

        //list the servers and build the buttons
        for (const server of data.data.servers) {
            if (server.labels.owner === userEmail) {
                const { deviceIP } = await getDevices(server.name);
                app.client.chat.postEphemeral({
                channel: `${body.channel.id}`,
                user: `${body.user.id}`,
                blocks: [
                    {
                    "type": "section",
                    "text": {
                        "type": "mrkdwn",
                        "text": `Server: ${server.name}\nServer id: ${server.id}\nStatus: ${server.status}\nConnect: https://login.tailscale.com/admin/machines/${deviceIP}`
                    }
                    },
                    {
                    "type": "actions",
                    "elements": [
                        {
                        "type": "button",
                        "text": {
                            "type": "plain_text",
                            "text": "Start"
                        },
                        "action_id": `button_start_${server.id}`
                        },
                        {
                        "type": "button",
                        "text": {
                            "type": "plain_text",
                            "text": "Stop"
                        },
                        "action_id": `button_stop_${server.id}`
                        },
                        {
                        "type": "button",
                        "text": {
                            "type": "plain_text",
                            "text": "Delete"
                        },
                        "action_id": `button_delete_${server.name}`
                        }
                    ]
                    }
                ],
                text: "VM options"
                })
            }
        }
    },

    //start a hetzner server
    startServer: async ({ app, body, vmid }) => {
        await axios.post(`https://api.hetzner.cloud/v1/servers/${vmid}/actions/poweron`, null, {
            headers: {
              'Authorization': `Bearer ${process.env.HETZNER_API_TOKEN}`
            }
        })
        .catch(error => {
        log.error('Error starting the server', axiosError(error));
        app.client.chat.postEphemeral({
            channel: `${body.channel.id}`,
            user: `${body.user.id}`,
            text: `Server Id: ${vmid} failed to start.`
        });
        return;
        });
        
        app.client.chat.postEphemeral({
        channel: `${body.channel.id}`,
        user: `${body.user.id}`,
        text: `Server Id: ${vmid} has been started.`
        });
    },

    //stop a hetzner server
    stopServer: async ({ app, body, vmid }) => {
        await axios.post(`https://api.hetzner.cloud/v1/servers/${vmid}/actions/poweroff`, null, {
            headers: {
              'Authorization': `Bearer ${process.env.HETZNER_API_TOKEN}`
            }
        })
        .catch(error => {
        log.error('Error stopping the server', axiosError(error));
        app.client.chat.postEphemeral({
            channel: `${body.channel.id}`,
            user: `${body.user.id}`,
            text: `Server Id: ${vmid} failed to stop.`
        });
        return;
        });
        
        app.client.chat.postEphemeral({
        channel: `${body.channel.id}`,
        user: `${body.user.id}`,
        text: `Server Id: ${vmid} has been stopped.`
        });
    }
}