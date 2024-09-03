import axios from 'axios';
import 'dotenv/config';
import formatUser from '../util/format-user.js';
import getServer from '../util/get-servers.js';
import { uniqueNamesGenerator, colors, animals } from 'unique-names-generator';
import getDevices from '../util/get-devices-info.js';

const delay = (ms) => {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const region = "hel1";

export default {
    description: 'Sets up vm options',

    button: async ({ app, actionId, body, response }) => {
        if (actionId === 'button_list_servers') {
          const data = await getServer();

              // Call the users.info method using the WebClient
              const info = await app.client.users.info({
                user: body.user.id
              })
              .catch(error => {
                console.error('Error:', error);
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
        } else if (actionId === 'button_create_vm') {
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
            console.error('Error:', error);
          });

          const userEmail = formatUser(info.user.profile.email);
          
          //hetzner api to create the server
          const userData = `#cloud-config\nruncmd:\n  - ['sh', '-c', 'curl -fsSL https://tailscale.com/install.sh | sh']\n  - ['tailscale', 'up', '--authkey=${process.env.TAILSCALE_AUTH_KEY}']\n  - ['tailscale', 'set', '--ssh']\n  - ['tailscale', 'set', '--accept-routes']\n  - ['passwd', '-d', 'root']`
          
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
            console.error('Error:', error);
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
              console.error('Error:', error);

          });
          //return info for tailscale
          app.client.chat.postEphemeral({
            channel: `${body.channel.id}`,
            user: `${body.user.id}`,
            text: `The server has been created: https://login.tailscale.com/admin/machines/${deviceIP}`
          });

        } else if (actionId.startsWith('button_start')) {
          const vmid = actionId.split('_')[2];
          
          await axios.post(`https://api.hetzner.cloud/v1/servers/${vmid}/actions/poweron`, null, {
            headers: {
              'Authorization': `Bearer ${process.env.HETZNER_API_TOKEN}`
            }
          })
          .catch(error => {
            console.error('Error:', error);
          });
          
          app.client.chat.postEphemeral({
            channel: `${body.channel.id}`,
            user: `${body.user.id}`,
            text: `Server Id: ${vmid} has been started.`
          });
        } else if (actionId.startsWith('button_stop')) {
          const vmid = actionId.split('_')[2];

          await axios.post(`https://api.hetzner.cloud/v1/servers/${vmid}/actions/poweroff`, null, {
            headers: {
              'Authorization': `Bearer ${process.env.HETZNER_API_TOKEN}`
            }
          })
          .catch(error => {
            console.error('Error:', error);
          });
          
          app.client.chat.postEphemeral({
            channel: `${body.channel.id}`,
            user: `${body.user.id}`,
            text: `Server Id: ${vmid} has been stopped.`
          });
        } else if (actionId.startsWith('button_delete')) {
          const serverName = actionId.split('_')[2];

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
            console.error('Error:', error);
          });

          //delete server from hetzner
          await axios.delete(`https://api.hetzner.cloud/v1/servers/${vmid}`, {
            headers: {
              'Authorization': `Bearer ${process.env.HETZNER_API_TOKEN}`
            }
          })
          .catch(error => {
            console.error('Error:', error);
          });

          app.client.chat.postEphemeral({
            channel: `${body.channel.id}`,
            user: `${body.user.id}`,
            text: `Server: ${serverName} has been deleted.`
          });
        } else {
            response({
                text: `This button is registered with the vm command, but does not have an action associated with it.`
            })
        }
    },
    
    run: async ({ message, app }) => {
      app.client.chat.postEphemeral({
        channel: `${message.channel}`,
        user: `${message.user}`,
        blocks: [
          {
            "type": "section",
            "text": {
              "type": "mrkdwn",
              "text": "Click one of the buttons below for VM options:"
            }
          },
          {
            "type": "actions",
            "elements": [
              {
                "type": "button",
                "text": {
                  "type": "plain_text",
                  "text": "List Servers"
                },
                "action_id": "button_list_servers"
              },
              {
                "type": "button",
                "text": {
                  "type": "plain_text",
                  "text": "Create Server"
                },
                "action_id": "button_create_vm"
              }
            ]
          }
        ],
        text: "VM options"
      })        
    }
}