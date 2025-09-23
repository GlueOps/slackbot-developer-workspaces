import libvirt from '../../util/libvirt/libvirt-server.js';
import vmCreateModal from '../../user-interface/modals/vm-create.js';
import buttonBuilder from '../../util/button-builder.js';
import 'dotenv/config';
import axios from 'axios';
import logger from '../../util/logger.js';
import vmEditModal from '../../user-interface/modals/vm-edit.js';

const log = logger();

export default {
  description: 'Sets up vm options',

  button: async ({ app, actionId, body, commandPrefix }) => {
    if (actionId === 'button_start_libvirt') {
      const { serverName, region } = JSON.parse(body.actions[0].value);
          
      await app.client.chat.postEphemeral({
      channel: body.channel.id,
      user: body.user.id,
      text: `Starting Server: ${serverName}`
      });

      libvirt.startServer({ app, body, serverName, region });
    } else if (actionId === 'button_stop_libvirt') {
        const { serverName, region } = JSON.parse(body.actions[0].value);

        await app.client.chat.postEphemeral({
        channel: body.channel.id,
        user: body.user.id,
        text: `Stopping Server: ${serverName}`
        });

        libvirt.stopServer({ app, body, serverName, region });
    } else if (actionId === 'button_delete_libvirt') {
      const { serverName, region } = JSON.parse(body.actions[0].value);

      await app.client.chat.postEphemeral({
      channel: body.channel.id,
      user: body.user.id,
      text: `Deleting Server: ${serverName}`
      });

      libvirt.deleteServer({ app, body, serverName, region });
    } else if (actionId === 'button_edit_libvirt') {
        const { serverName, region, tags } = JSON.parse(body.actions[0].value);

        await app.client.views.open({
          trigger_id: body.trigger_id,
          view: vmEditModal({ description: tags.description || '', metaData: JSON.stringify({ serverName, region, channel_id: body.channel.id, tags }) })
        });
    } else {
        await app.client.chat.postEphemeral({
          channel: body.channel.id,
          user: body.user.id,
          text: `This button is registered with the /${commandPrefix}vm command, but does not have an action associated with it.`
        });
    }
  },
  
  run: async ({ event, app, body, commandPrefix }) => {
    const args = event.text.trim().split(/\s+/);
    const subcommand = args[0];

    switch (subcommand) {
      case 'create':
        const result = await app.client.views.open({
          trigger_id: body.trigger_id,
          view: {
            type: 'modal',
            callback_id: 'vm-modal-loading',
            title: { type: 'plain_text', text: 'Loading...' },
            blocks: [
              {
                type: 'section',
                text: { type: 'plain_text', text: 'Fetching data...' }
              }
            ]
          }
        });

        let regionsRes, imagesRes;
        try {
          [regionsRes, imagesRes] = await Promise.all([
            axios.get(`${process.env.PROVISIONER_URL}/v1/regions`, {
              headers: { 'Authorization': `${process.env.PROVISIONER_API_TOKEN}` }
            }),
            axios.get(`${process.env.PROVISIONER_URL}/v1/get-images`)
          ]);
      } catch (error) {
        log.error('Error fetching regions or images:', error);
        await app.client.chat.postEphemeral({
          channel: event.channel_id,
          user: event.user_id,
          text: 'Error fetching regions or images. Please try again later.'
        });
        return;
      }
        const regions = regionsRes.data || [];
        const images = imagesRes.data.images || [];
        
        await app.client.views.update({
          view_id: result.view.id,
          view: vmCreateModal({ regions, images, servers: [], metaData: JSON.stringify({ channel_id: event.channel_id }) })
        });
      break;
    case 'list': {
      const servers = [];
      const blocks = [];

      servers.push(...await libvirt.listServers({ app, body }));
      // Check if there are any servers
      if (servers.length) {
        for (const server of servers) {
          const description = server.tags.description || 'No description provided';
          const buttonsArray = [
              { text: "Start", actionId: `button_start_libvirt`, value: JSON.stringify({ serverName: server.serverName, region: server.region }) },
              { text: "Stop", actionId: `button_stop_libvirt`, value: JSON.stringify({ serverName: server.serverName, region: server.region }) },
              { text: "Delete", actionId: `button_delete_libvirt`, value: JSON.stringify({ serverName: server.serverName, region: server.region }) },
              { text: "Edit Description", actionId: `button_edit_libvirt`, value: JSON.stringify({ serverName: server.serverName, region: server.region, tags: server.tags }) }
          ];

          // Build buttons and add them to blocks
          const buttonBlock = buttonBuilder({
              buttonsArray,
              headerText: `Server: ${server.serverName}\nRegion: ${server.region}\nDescription: ${description}\nStatus: ${server.status}`,
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
                "text": `Access your existing VMs with: <${process.env.GUACAMOLE_CONNECTION_URL}|Guacamole>`
            }
        });

        // Send the combined blocks in a single message
        await app.client.chat.postEphemeral({
            channel: event.channel_id,
            user: event.user_id,
            text: 'Server List',
            blocks,  // Combine all button blocks
        });
      } else {
          await app.client.chat.postEphemeral({
              channel: event.channel_id,
              user: event.user_id,
              text: "You don't currently have any servers"
          }); 
      }
      break;
    }
    case 'start': {
      const serverName = args[1];
      if (!serverName) {
        await app.client.chat.postEphemeral({
          channel: event.channel_id,
          user: event.user_id,
          text: `Please provide a server name to start. Usage: /${commandPrefix}vm start <server-name>`
        });
        return;
      }

      await app.client.chat.postEphemeral({
        channel: event.channel_id,
        user: event.user_id,
        text: `Starting Server: ${serverName}`
      });

      const servers = [...await libvirt.listServers({ app, body })];

      const server = servers.find(s => s.serverName === serverName);
      if (!server) {
        await app.client.chat.postEphemeral({
          channel: event.channel_id,
          user: event.user_id,
          text: `Server "${serverName}" not found. Please check the server name and try again.`
        });
        return;
      }

      libvirt.startServer({ app, body, serverName, region: server.region });
      break;
    }
    case 'stop': {
      const serverName = args[1];
      if (!serverName) {
        await app.client.chat.postEphemeral({
          channel: event.channel_id,
          user: event.user_id,
          text: `Please provide a server name to stop. Usage: /${commandPrefix}vm stop <server-name>`
        });
        return;
      }

      await app.client.chat.postEphemeral({
        channel: event.channel_id,
        user: event.user_id,
        text: `Stopping Server: ${serverName}`
      });
      
      const servers = [...await libvirt.listServers({ app, body })];

      const server = servers.find(s => s.serverName === serverName);
      if (!server) {
        await app.client.chat.postEphemeral({
          channel: event.channel_id,
          user: event.user_id,
          text: `Server "${serverName}" not found. Please check the server name and try again.`
        });
        return;
      }

      libvirt.stopServer({ app, body, serverName, region: server.region });
      break;
    }
    case 'delete': {
      const serverName = args[1];
      if (!serverName) {
        await app.client.chat.postEphemeral({
          channel: event.channel_id,
          user: event.user_id,
          text: `Please provide a server name to delete. Usage: /${commandPrefix}vm delete <server-name>`
        });
        return;
      }

      await app.client.chat.postEphemeral({
        channel: event.channel_id,
        user: event.user_id,
        text: `Deleting Server: ${serverName}`
      });

      const servers = [...await libvirt.listServers({ app, body })];

      const server = servers.find(s => s.serverName === serverName);
      if (!server) {
        await app.client.chat.postEphemeral({
          channel: event.channel_id,
          user: event.user_id,
          text: `Server "${serverName}" not found. Please check the server name and try again.`
        });
        return;
      }

      libvirt.deleteServer({ app, body, serverName, region: server.region });
      break;
    }
    case 'edit': {
      const serverName = args[1];
      if (!serverName) {
        await app.client.chat.postEphemeral({
          channel: event.channel_id,
          user: event.user_id,
          text: `Please provide a server name to edit. Usage: /${commandPrefix}vm edit <server-name>`
        });
        return;
      }

      const result = await app.client.views.open({
        trigger_id: body.trigger_id,
        view: {
          type: 'modal',
          callback_id: 'vm-modal-loading',
          title: { type: 'plain_text', text: 'Loading...' },
          blocks: [
            {
              type: 'section',
              text: { type: 'plain_text', text: 'Fetching data...' }
            }
          ]
        }
      });

      const servers = [...await libvirt.listServers({ app, body })];
      const server = servers.find(s => s.serverName === serverName);
      if (!server) {
        await app.client.views.update({
        view_id: result.view.id,
        view: {
          type: 'modal',
          callback_id: 'vm-modal-error',
          title: { type: 'plain_text', text: 'Error' },
          blocks: [
            {
              type: 'section',
              text: { type: 'plain_text', text: `Server: ${serverName} not found. Please check the server name and try again.` }
            }
          ]
        }
        });
        return;
      }

      await app.client.views.update({
        view_id: result.view.id,
        view: vmEditModal({ description: server.tags.description || '', metaData: JSON.stringify({ serverName, region: server.region, channel_id: event.channel_id, tags: server.tags }) })
      });

      break;
    }
    default:
      await app.client.chat.postEphemeral({
        channel: event.channel_id,
        user: event.user_id,
        text: `Access your existing VMs with: <${process.env.GUACAMOLE_CONNECTION_URL}|Guacamole>\n\nAvailable subcommands:\n• /${commandPrefix}vm create - Create a new VM\n• /${commandPrefix}vm list - List existing VMs\n• /${commandPrefix}vm start <vm name> - Start a VM\n• /${commandPrefix}vm stop <vm name> - Stop a VM\n• /${commandPrefix}vm delete <vm name> - Delete a VM\n• /${commandPrefix}vm edit <vm name> - Edit a VM Description`,
      });
    }
  }
}
