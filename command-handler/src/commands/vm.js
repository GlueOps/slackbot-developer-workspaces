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
          aws.startServer({ app, body, instanceId: data.instanceId, region: data.region });
      } else if (actionId === 'button_stop_aws') {
          aws.stopServer({ app, body, instanceId: data.instanceId, region: data.region });
      } else if (actionId === 'button_delete_aws') {
          aws.deleteServer({ app, body, instanceId: data.instanceId, serverName: data.serverName, region: data.region });
      } else if (actionId === 'button_start_hetzner') {
          hetzner.startServer({ app, body, vmID: data.vmID });
      } else if (actionId === 'button_stop_hetzner') {
          hetzner.stopServer({ app, body, vmID: data.vmID });
      } else if (actionId === 'button_delete_hetzner') {
          hetzner.deleteServer({ app, body, serverName: data.serverName });
      } else if (actionId === 'button_start_libvirt') {
          libvirt.startServer({ app, body, serverName: data.serverName, region: data.region });
      } else if (actionId === 'button_stop_libvirt') {
          libvirt.stopServer({ app, body, serverName: data.serverName, region: data.region });
      } else if (actionId === 'button_delete_libvirt') {
          libvirt.deleteServer({ app, body, serverName: data.serverName, region: data.region });
      } else if (actionId.startsWith('button_create_image_aws')) {
          aws.createServer({ app, body, imageName: data.imageName, ami: data.ami, region: data.region, instanceType: data.instanceType });
      } else if (actionId.startsWith('button_create_image_hetzner')) {
          hetzner.createServer({ app, body, imageID: data.imageID, imageName: data.imageName, region: data.region, serverType: data.serverType });
      } else if (actionId.startsWith('button_create_image_libvirt')) {
          libvirt.createServer({ app, body, imageName: data.imageName, region: data.region, instanceType: data.instanceType });
      } else if (actionId === 'button_create_vm_hetzner') {
          hetzner.selectRegion({ app, body });
      } else if (actionId === 'button_create_vm_aws') {
          aws.selectRegion({ app, body });
      } else if (actionId === 'button_create_vm_libvirt') {
          libvirt.selectRegion({ app, body });
      } else if (actionId.startsWith('button_select_hetzner_server')) {
          hetzner.selectServer({ app, body, data });
      } else if (actionId.startsWith('button_select_libvirt_server')) {
        libvirt.selectServer({ app, body, data });
      } else if (actionId.startsWith('button_select_aws_server')) {
          aws.selectServer({ app, body, data });
      } else if (actionId.startsWith('button_select_hetzner_image')) {
          hetzner.selectImage({ app, body, data });
      } else if (actionId.startsWith('button_select_libvirt_image')) {
          libvirt.selectImage({ app, body, data });
      } else if (actionId.startsWith('button_select_aws_image')) {
          aws.selectImage({ app, body, data });
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