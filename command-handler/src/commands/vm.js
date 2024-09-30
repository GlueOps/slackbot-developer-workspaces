import hetzner from '../util/hetzner/hetzner-servers.js';
import aws from '../util/aws/aws-server.js';

export default {
    description: 'Sets up vm options',

    button: async ({ app, actionId, body, response }) => {
        if (actionId === 'button_list_servers') {
          //list hetzner servers

          await aws.listServers({ app, body });
          await hetzner.listServers({ app, body })
        } else if (actionId === 'button_create_vm') {
          app.client.chat.postEphemeral({
            channel: `${body.channel.id}`,
            user: `${body.user.id}`,
            blocks: [
              {
                "type": "section",
                "text": {
                  "type": "mrkdwn",
                  "text": "Select a platform to create the vm in:"
                }
              },
              {
                "type": "actions",
                "elements": [
                  {
                    "type": "button",
                    "text": {
                      "type": "plain_text",
                      "text": "aws"
                    },
                    "action_id": "button_create_vm_aws"
                  },
                  {
                    "type": "button",
                    "text": {
                      "type": "plain_text",
                      "text": "hetzner"
                    },
                    "action_id": "button_create_vm_hetzner"
                  }
                ]
              }
            ],
            text: "VM options"
          })  

        } else if (actionId.startsWith('button_start_aws')) {
          const instanceId = actionId.split('_')[3];
          
          //start a hetzner server
          aws.startServer({ app, body, instanceId });

        } else if (actionId.startsWith('button_stop_aws')) {
          const instanceId = actionId.split('_')[3];

          //stop a hetzner server
          aws.stopServer({ app, body, instanceId });

        } else if (actionId.startsWith('button_delete_aws')) {
          const instanceId = actionId.split('_')[3];
          const serverName = actionId.split('_')[4];

          //delete the server
          aws.deleteServer({ app, body, instanceId, serverName })

        } else if (actionId.startsWith('button_start_hetzner')) {
          const vmid = actionId.split('_')[3];
          
          //start a hetzner server
          hetzner.startServer({ app, body, vmid });

        } else if (actionId.startsWith('button_stop_hetzner')) {
          const vmid = actionId.split('_')[3];

          //stop a hetzner server
          hetzner.stopServer({ app, body, vmid });

        } else if (actionId.startsWith('button_delete_hetzner')) {
          const serverName = actionId.split('_')[3];

          //delete the server
          hetzner.deleteServer({app, body, serverName})

        } else if (actionId.startsWith('button_create_image_aws')) {
          const imageName = actionId.split('_')[4];
          const ami = actionId.split('_')[5];
          aws.createServer({ app, body, imageName, ami });

        } else if (actionId.startsWith('button_create_image_hetzner')) {
          const imageName = actionId.split('_')[4];
          const imageID = actionId.split('_')[5];
          hetzner.createServer({ app, body, imageID, imageName });

        } else if (actionId.startsWith('button_create_vm_hetzner')) {
          //select the hetzner server to create before calling the create server
          hetzner.selectImage({ app, body });

        } else if (actionId.startsWith('button_create_vm_aws')) {
          //select the asw server to create before calling the create server
          aws.selectImage({ app, body });

        } else {
            response({
                text: `This button is registered with the vm command, but does not have an action associated with it.`
            })
        }
    },
    
    run: async ({ event, app }) => {
      app.client.chat.postEphemeral({
        channel: `${event.channel}`,
        user: `${event.user}`,
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