import hetzner from '../util/hetzner-servers.js'

export default {
    description: 'Sets up vm options',

    button: async ({ app, actionId, body, response }) => {
        if (actionId === 'button_list_servers') {
          //list hetzner servers
          hetzner.listServers({ app, body })
        } else if (actionId === 'button_create_vm') {
          //select the hetzner server to create before calling the create server
          hetzner.selectImage({ app, body });

        } else if (actionId.startsWith('button_start')) {
          const vmid = actionId.split('_')[2];
          
          //start a hetzner server
          hetzner.startServer({ app, body, vmid });

        } else if (actionId.startsWith('button_stop')) {
          const vmid = actionId.split('_')[2];

          //stop a hetzner server
          hetzner.stopServer({ app, body, vmid });

        } else if (actionId.startsWith('button_delete')) {
          const serverName = actionId.split('_')[2];

          //delete the server
          hetzner.deleteServer({app, body, serverName})

        } else if (actionId.startsWith('button_create_image')) {
          const imageName = actionId.split('_')[3];
          const imageID = actionId.split('_')[4];
          hetzner.createServer({ app, body, imageID, imageName });
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