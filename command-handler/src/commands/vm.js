import libvirt from '../util/libvirt/libvirt-server.js';
import buttonBuilder from '../util/button-builder.js';
import 'dotenv/config';

export default {
    description: 'Sets up vm options',

    button: async ({ app, actionId, body, response }) => {
      if (actionId === 'button_list_servers') {
        const servers = [];
        const blocks = [];  // Use this to accumulate all blocks

        servers.push(...await libvirt.listServers({ app, body }));
        // Check if there are any servers
        if (servers.length) {
          for (const server of servers) {
              const buttonsArray = [
                  { text: "Start", actionId: `button_start_libvirt`, value: JSON.stringify({ serverName: server.serverName, region: server.region }) },
                  { text: "Stop", actionId: `button_stop_libvirt`, value: JSON.stringify({ serverName: server.serverName, region: server.region }) },
                  { text: "Delete", actionId: `button_delete_libvirt`, value: JSON.stringify({ serverName: server.serverName, region: server.region }) }
              ];
  
              // Build buttons and add them to blocks
              const buttonBlock = buttonBuilder({
                  buttonsArray,
                  headerText: `Server: ${server.serverName}\nRegion: ${server.region}\nStatus: ${server.status}`,
                  fallbackText: "Device not supported to use VM command"
              });
  
              // Push the blocks into the main blocks array
              blocks.push(...buttonBlock.blocks);
          }

          // Add header message at the end
          blocks.push({
              "type": "section",
              "text": {
                  "type": "mrkdwn",
                  "text": `Access your existing VM's with: <${process.env.GUACAMOLE_CONNECTION_URL}|Guacamole>`
              }
          });

          // Send the combined blocks in a single message
          await app.client.chat.postEphemeral({
              channel: `${body.channel.id}`,
              user: `${body.user.id}`,
              text: 'Yo here are your servers bro',
              blocks,  // Combine all button blocks
          });
        } else {
            await app.client.chat.postEphemeral({
                channel: `${body.channel.id}`,
                user: `${body.user.id}`,
                text: "You don't currently have any servers"
            }); 
        }
      } else if (actionId === 'button_create_vm') {
          const buttonsArray = [];
          //select the libvirt region to create before calling the create server
          libvirt.selectRegion({ app, body });
        } else if (actionId === 'button_start_libvirt') {
          const { serverName, region } = JSON.parse(body.actions[0].value);
            
          libvirt.startServer({ app, body, serverName, region });
        } else if (actionId === 'button_stop_libvirt') {
          const { serverName, region } = JSON.parse(body.actions[0].value);

          libvirt.stopServer({ app, body, serverName, region });
        } else if (actionId === 'button_delete_libvirt') {
          const { serverName, region } = JSON.parse(body.actions[0].value);

          //delete the server
          libvirt.deleteServer({ app, body, serverName, region });
        } else if (actionId.startsWith('button_create_image_libvirt')) {
          const { imageName, region, instanceType } = JSON.parse(body.actions[0].value);
          libvirt.createServer({ app, body, imageName, region, instanceType });
        } else if (actionId.startsWith('button_select_libvirt_server')) {
          const data = JSON.parse(body.actions[0].value);
          //select the libvirt server type to create before calling the create server
          libvirt.selectServer({ app, body, data });
        } else if (actionId.startsWith('button_select_libvirt_image')) {
          const data = JSON.parse(body.actions[0].value);
          //select the libvirt image to create before calling the create server
          libvirt.selectImage({ app, body, data });
        } else {
          response({
            text: `This button is registered with the vm command, but does not have an action associated with it.`
          });
        }
    },
    
    run: async ({ event, app }) => {
      const buttonsArray = [
        { text: "List Servers", actionId: "button_list_servers" },
        { text: "Create Server", actionId: "button_create_vm" },
      ];
      const buttons = buttonBuilder({ buttonsArray, 
        headerText: `Access existing VM's with: <${process.env.GUACAMOLE_CONNECTION_URL}|Guacamole>>

Click one of the buttons below for VM options:`, 
        fallbackText: "device unsupported to use vm command" 
      });
      app.client.chat.postEphemeral({
        channel: `${event.channel}`,
        user: `${event.user}`,
        text: 'Create a vm',
        ...buttons
      });       
    }
}
