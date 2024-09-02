import axios from 'axios';
import 'dotenv/config';
import formatUser from '../util/format-user.js';

export default {
    description: 'Sets up vm options',

    button: async ({ handler, app, actionId, body, response }) => {
        if (actionId === 'button_list_servers') {
            const data = await axios.get('https://api.hetzner.cloud/v1/servers', {
                headers: {
                  'Authorization': `Bearer ${process.env.HETZNER_API_TOKEN}`
                }
              })
              .catch(error => {
                console.error('Error:', error);
              });
    
              console.log(data.data);
              // console.log(body);

              try {
                // Call the users.info method using the WebClient
                const info = await app.client.users.info({
                  user: body.user.id
                });
              
                // console.log(info.user.profile.email);
                // console.log(user);
              }
              catch (error) {
                console.error(error);
              }
    
            response({
                text: `${JSON.stringify(data.data)}`
            })
        } else if (actionId === 'button_create_vm') {
          //auto generate the name

          //hetzner api to create the server

          //set 2 minute delay

          //get servers from tailscale
          const devices = await axios.get(`https://api.tailscale.com/api/v2/tailnet/${process.env.TAILSCALE_TAILNET_NAME}/devices`, {
            headers: {
              'Authorization': `Bearer ${process.env.TAILSCALE_API_TOKEN}`
            }
          })
          .catch(error => {
            console.error('Error:', error);
          });

          console.log(devices.data.devices);

          //set tag in tailscale
          const data = await axios.get(`https://api.tailscale.com/api/v2/device/${deviceId}/tags`, {
            headers: {
              'Authorization': `Bearer ${process.env.TAILSCALE_API_TOKEN}`
            }
          })
            .catch(error => {
              console.error('Error:', error);
              //delete hetzner instance

            });
            //return ip form tailscale

            
        } else if (actionId === 'button_delete_vm') {

          try {
            // Call the users.info method using the WebClient
            const info = await app.client.users.info({
              user: body.user.id
            });

            const owner = formatUser(info.user.profile.email)
            console.log(owner);
          
          }
          catch (error) {
            console.error(error);
          }
        //   const data = await axios.get('https://api.hetzner.cloud/v1/servers', {
        //     headers: {
        //       'Authorization': `Bearer ${process.env.HETZNER_API_TOKEN}`
        //     }
        //   })
        //   .catch(error => {
        //     console.error('Error:', error);
        //   });

        // response({
        //     text: `${JSON.stringify(data.data)}`
        // })
        } else {
            response({
                text: `This button is registered with the vm command, but does not have an action associated with it.`
            })
        }
    },
    
    run: async ({ response, message, app }) => {
      console.log(message);
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
              },
              {
                "type": "button",
                "text": {
                  "type": "plain_text",
                  "text": "Delete Server"
                },
                "action_id": "button_delete_vm"
              }
            ]
          }
        ],
        text: "VM options"
      })        
    }
}