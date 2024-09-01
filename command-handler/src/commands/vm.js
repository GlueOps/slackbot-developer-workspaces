import axios from 'axios';
import 'dotenv/config';

export default {
    description: 'Sets up vm options',

    button: async ({ handler, actionId, body, response }) => {
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
    
            response({
                text: `${JSON.stringify(data.data)}`
            })
        } else if (actionId === 'button_create_vm') {
            response({
                text: `This is a placeholder Button to create vms`
            });
        } else if (actionId === 'button_delete_vm') {
            response({
                text: `This is a placeholder Button to delete vms`
            });
        } else {
            response({
                text: `This button is registered with the vm command, but does not have an action associated with it.`
            })
        }
    },
    
    run: async ({ response }) => {

        response({
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
          });          
    }
}