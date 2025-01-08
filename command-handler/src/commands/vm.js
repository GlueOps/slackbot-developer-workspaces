import hetzner from '../util/hetzner/hetzner-servers.js';
import aws from '../util/aws/aws-server.js';
import libvirt from '../util/libvirt/libvirt-server.js';
import buttonBuilder from '../util/button-builder.js';

export default {
    description: 'Sets up vm options',

    button: async ({ app, actionId, body, response }) => {
      if (actionId === 'button_list_servers') {
        const servers = [];
        const blocks = [];  // Use this to accumulate all blocks
    
        // Fetch servers from AWS and Hetzner
        servers.push(...await aws.listServers({ app, body }));
        servers.push(...await hetzner.listServers({ app, body }));
        servers.push(...await libvirt.listServers({ app, body }));
    
        // Check if there are any servers
        if (servers.length) {
          for (const server of servers) {
              const buttonsArray = [
                  { text: "Start", actionId: `button_start_${server.cloud}`, value: JSON.stringify({ instanceId: server.serverID, vmID: server.serverID, serverName: server.serverName, region: server.region }) },
                  { text: "Stop", actionId: `button_stop_${server.cloud}`, value: JSON.stringify({ instanceId: server.serverID, vmID: server.serverID, serverName: server.serverName, region: server.region }) },
                  { text: "Delete", actionId: `button_delete_${server.cloud}`, value: JSON.stringify({ instanceId: server.serverID, serverName: server.serverName, region: server.region }) }
              ];
  
              // Build buttons and add them to blocks
              const buttonBlock = buttonBuilder({
                  buttonsArray,
                  headerText: `Cloud: ${server.cloud}\nServer: ${server.serverName}\nServer ID: ${server.serverID}\nRegion: ${server.region}\nStatus: ${server.status}\nConnect: ${server.connect}`,
                  fallbackText: "Device not supported to use VM command"
              });
  
              // Push the blocks into the main blocks array
              blocks.push(...buttonBlock.blocks);
          }
  
          // Send the combined blocks in a single message
          await app.client.chat.postEphemeral({
              channel: `${body.channel.id}`,
              user: `${body.user.id}`,
              text: 'Server List',
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
          const buttonsArray = [
            { text: "aws", actionId: "button_create_vm_aws" },
            { text: "hetzner", actionId: "button_create_vm_hetzner" },
            { text: "libvirt", actionId: "button_create_vm_libvirt" },
          ];
          const buttons = buttonBuilder({ buttonsArray, headerText: "choose your platform", fallbackText: "device unsupported" });
          app.client.chat.postEphemeral({
          channel: `${body.channel.id}`,
          user: `${body.user.id}`,
          text: 'select a platform',
          ...buttons
          });
      } else if (actionId === 'button_start_aws') {
          const { instanceId, region } = JSON.parse(body.actions[0].value);
            
          aws.startServer({ app, body, instanceId, region });
      } else if (actionId === 'button_stop_aws') {
          const { instanceId, region } = JSON.parse(body.actions[0].value);

          aws.stopServer({ app, body, instanceId, region });
      } else if (actionId === 'button_delete_aws') {
          const { instanceId, serverName, region } = JSON.parse(body.actions[0].value);

          //delete the server
          aws.deleteServer({ app, body, instanceId, serverName, region });
        } else if (actionId === 'button_start_hetzner') {
          const { vmID } = JSON.parse(body.actions[0].value);
          
          //start a hetzner server
          hetzner.startServer({ app, body, vmID });
        } else if (actionId === 'button_stop_hetzner') {
          const { vmID } = JSON.parse(body.actions[0].value);

          //stop a hetzner server
          hetzner.stopServer({ app, body, vmID });
        } else if (actionId === 'button_delete_hetzner') {
          const { serverName } = JSON.parse(body.actions[0].value);

          //delete the server
          hetzner.deleteServer({ app, body, serverName });
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
        } else if (actionId.startsWith('button_create_image_aws')) {
          const { imageName, ami, region, instanceType } = JSON.parse(body.actions[0].value);
          aws.createServer({ app, body, imageName, ami, region, instanceType });
        } else if (actionId.startsWith('button_create_image_hetzner')) {
          const { imageID, imageName, region, serverType } = JSON.parse(body.actions[0].value);
          hetzner.createServer({ app, body, imageID, imageName, region, serverType });
        } else if (actionId.startsWith('button_create_image_libvirt')) {
          const { imageName, instanceType } = JSON.parse(body.actions[0].value);
          libvirt.createServer({ app, body, imageName, region, instanceType });
        } else if (actionId === 'button_create_vm_hetzner') {
          //select the hetzner server to create before calling the create server
          hetzner.selectRegion({ app, body });
        } else if (actionId === 'button_create_vm_aws') {
          //select the aws server to create before calling the create server
          aws.selectRegion({ app, body });
        } else if (actionId === 'button_create_vm_libvirt') {
          //select the libvirt image to create before calling the create server
          libvirt.selectRegion({ app, body });
        } else if (actionId.startsWith('button_select_hetzner_server')) {
          const data = JSON.parse(body.actions[0].value);
          //select the hetzner server to create before calling the create server
          hetzner.selectServer({ app, body, data });
        } else if (actionId.startsWith('button_select_aws_server')) {
          const data = JSON.parse(body.actions[0].value);
          //select the asw server to create before calling the create server
          aws.selectServer({ app, body, data });
        } else if (actionId.startsWith('button_select_libvirt_server')) {
          const data = JSON.parse(body.actions[0].value);
          //select the libvirt server type to create before calling the create server
          libvirt.selectServer({ app, body, data });
        } else if (actionId.startsWith('button_select_hetzner_image')) {
          const data = JSON.parse(body.actions[0].value);
          //select the hetzner server to create before calling the create server
          hetzner.selectImage({ app, body, data });
        } else if (actionId.startsWith('button_select_aws_image')) {
          const data = JSON.parse(body.actions[0].value);
          //select the asw server to create before calling the create server
          aws.selectImage({ app, body, data });
        } else if (actionId.startsWith('button_select_libvirt_image')) {
          const data = JSON.parse(body.actions[0].value);
          //select the hetzner server to create before calling the create server
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
        headerText: "Click one of the buttons below for VM options:", 
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