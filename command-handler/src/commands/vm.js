import hetzner from '../util/hetzner/hetzner-servers.js';
import aws from '../util/aws/aws-server.js';

export default {
    description: 'Sets up vm options',

    button: async ({ app, actionId, body, response }) => {
      switch(actionId) {
        case 'button_list_servers': {
          await aws.listServers({ app, body });
          await hetzner.listServers({ app, body });
          break;
        }
        case 'button_create_vm': {
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
          });
          break;
        }
        case 'button_start_aws': {
          const { instanceId, region } = JSON.parse(body.actions[0].value);
          
          aws.startServer({ app, body, instanceId, region });
          break;
        }
        case 'button_stop_aws': {
          const { instanceId, region } = JSON.parse(body.actions[0].value);

          aws.stopServer({ app, body, instanceId, region });
          break;
        }
        case 'button_delete_aws': {
          const { instanceId, serverName, region } = JSON.parse(body.actions[0].value);

          //delete the server
          aws.deleteServer({ app, body, instanceId, serverName, region });
          break;
        }
        case 'button_start_hetzner': {
          const { vmID } = JSON.parse(body.actions[0].value);
          
          //start a hetzner server
          hetzner.startServer({ app, body, vmID });
          break;
        }
        case 'button_stop_hetzner': {
          const { vmID } = JSON.parse(body.actions[0].value);

          //stop a hetzner server
          hetzner.stopServer({ app, body, vmID });
          break;
        }
        case 'button_delete_hetzner': {
          const { serverName } = JSON.parse(body.actions[0].value);

          //delete the server
          hetzner.deleteServer({ app, body, serverName });
          break;
        }
        case 'button_create_image_aws': {
          const { imageName, ami, region, instanceType } = JSON.parse(body.actions[0].value);
          aws.createServer({ app, body, imageName, ami, region, instanceType });
          break;
        }
        case 'button_create_image_hetzner': {
          const { imageID, imageName, region, serverType } = JSON.parse(body.actions[0].value);
          hetzner.createServer({ app, body, imageID, imageName, region, serverType });
          break;
        }
        case 'button_create_vm_hetzner': {
          //select the hetzner server to create before calling the create server
          hetzner.selectRegion({ app, body });
          break;
        }
        case 'button_create_vm_aws': {
          //select the aws server to create before calling the create server
          aws.selectRegion({ app, body });
          break;
        }
        case 'button_select_hetzner_server': {
          const data = JSON.parse(body.actions[0].value);
          //select the hetzner server to create before calling the create server
          hetzner.selectServer({ app, body, data });
          break;
        }
        case 'button_select_aws_server': {
          const data = JSON.parse(body.actions[0].value);
          //select the asw server to create before calling the create server
          aws.selectServer({ app, body, data });
          break;
        }
        case 'button_select_hetzner_image': {
          const data = JSON.parse(body.actions[0].value);
          //select the hetzner server to create before calling the create server
          hetzner.selectImage({ app, body, data });
          break;
        }
        case 'button_select_aws_image': {
          const data = JSON.parse(body.actions[0].value);
          //select the asw server to create before calling the create server
          aws.selectImage({ app, body, data });
          break;
        }
        default: {
          response({
            text: `This button is registered with the vm command, but does not have an action associated with it.`
          });
        }
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