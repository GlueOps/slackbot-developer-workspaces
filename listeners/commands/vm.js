import libvirt, { DEFAULT_TUNNEL_ENDPOINT, cdeAccessUrl } from '../../util/libvirt/libvirt-server.js';
import vmCreateModal from '../../user-interface/modals/vm-create.js';
import vmProfileModal from '../../user-interface/modals/vm-profile.js';
import buttonBuilder from '../../util/button-builder.js';
import { formatCreatedDate, sortByCreatedAtAsc } from '../../util/format-date.js';
import { listProfiles, getProfile, deleteProfile } from '../../util/profile-store.js';
import 'dotenv/config';
import axios from 'axios';
import logger from '../../util/logger.js';
import axiosError from '../../util/axios-error-handler.js';
import vmEditModal from '../../user-interface/modals/vm-edit.js';

const log = logger();

const MAX_VM_COUNT = 10;
const MAX_VM_RAM_MB = 9216;

// Placeholder modals for the Edit/Copy flow: we must claim the (~3s) trigger_id with an
// immediate views.open, then views.update in the real content once the S3 read finishes —
// otherwise a slow profile fetch lets the trigger expire and the modal never opens. These
// carry no submit/callback_id, so they can't be accidentally submitted.
const profileLoadingView = () => ({
  type: 'modal',
  title: { type: 'plain_text', text: 'Loading…' },
  blocks: [{ type: 'section', text: { type: 'plain_text', text: 'Fetching profile…' } }],
});
const profileErrorView = (text) => ({
  type: 'modal',
  title: { type: 'plain_text', text: 'Profile' },
  blocks: [{ type: 'section', text: { type: 'plain_text', text } }],
});

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
    } else if (actionId === 'button_profile_new') {
        await app.client.views.open({
          trigger_id: body.trigger_id,
          view: vmProfileModal({ metaData: JSON.stringify({ channel_id: body.channel.id }) })
        });
    } else if (actionId === 'button_profile_edit') {
        const { name } = JSON.parse(body.actions[0].value);
        // Claim the trigger with a loading modal before the S3 read (see profileLoadingView).
        let loading;
        try {
          loading = await app.client.views.open({ trigger_id: body.trigger_id, view: profileLoadingView() });
        } catch (error) {
          log.error('Failed to open loading modal for profile edit', error);
          return;
        }
        try {
          const info = await app.client.users.info({ user: body.user.id });
          const profile = await getProfile(info.user.profile.email, name);
          if (!profile?.env) {
            // Deleted since the list rendered — do NOT open an empty editor; saving it
            // would resurrect an empty profile under that name.
            await app.client.views.update({
              view_id: loading.view.id,
              view: profileErrorView(`Profile "${name}" no longer exists. Close this and refresh your profile list.`)
            });
            return;
          }
          const envText = Object.entries(profile.env).map(([k, v]) => `${k}=${v}`).join('\n');
          await app.client.views.update({
            view_id: loading.view.id,
            view: vmProfileModal({ name, envText, metaData: JSON.stringify({ channel_id: body.channel.id, name }) })
          });
        } catch (error) {
          log.error('Failed to open profile for editing', error);
          await app.client.views.update({
            view_id: loading.view.id,
            view: profileErrorView(`Failed to open profile: ${name}. Please try again.`)
          }).catch(() => {});
        }
    } else if (actionId === 'button_profile_copy') {
        const { name } = JSON.parse(body.actions[0].value);
        let loading;
        try {
          loading = await app.client.views.open({ trigger_id: body.trigger_id, view: profileLoadingView() });
        } catch (error) {
          log.error('Failed to open loading modal for profile copy', error);
          return;
        }
        try {
          const info = await app.client.users.info({ user: body.user.id });
          const profile = await getProfile(info.user.profile.email, name);
          if (!profile?.env) {
            await app.client.views.update({
              view_id: loading.view.id,
              view: profileErrorView(`Profile "${name}" no longer exists. Close this and refresh your profile list.`)
            });
            return;
          }
          const envText = Object.entries(profile.env).map(([k, v]) => `${k}=${v}`).join('\n');
          await app.client.views.update({
            view_id: loading.view.id,
            // Copy = a new profile pre-filled from the source, with an EDITABLE name (no
            // `name` in metaData). Suggests "<source>-copy"; the dev renames + saves. Also
            // serves as rename (copy then delete the original).
            view: vmProfileModal({ name: `${name}-copy`.slice(0, 60), envText, metaData: JSON.stringify({ channel_id: body.channel.id }) })
          });
        } catch (error) {
          log.error('Failed to copy profile', error);
          await app.client.views.update({
            view_id: loading.view.id,
            view: profileErrorView(`Failed to copy profile: ${name}. Please try again.`)
          }).catch(() => {});
        }
    } else if (actionId === 'button_profile_delete') {
        const { name } = JSON.parse(body.actions[0].value);
        try {
          const info = await app.client.users.info({ user: body.user.id });
          await deleteProfile(info.user.profile.email, name);
          await app.client.chat.postEphemeral({ channel: body.channel.id, user: body.user.id, text: `Deleted profile: ${name}` });
        } catch (error) {
          log.error('Failed to delete profile', error);
          await app.client.chat.postEphemeral({ channel: body.channel.id, user: body.user.id, text: `Failed to delete profile: ${name}` });
        }
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
        const vmCount = parseInt(args[1], 10) || 1;
        if (vmCount < 1 || vmCount > MAX_VM_COUNT || !Number.isInteger(vmCount)) {
          await app.client.chat.postEphemeral({
            channel: event.channel_id,
            user: event.user_id,
            text: `Invalid VM count. Please specify a number between 1 and ${MAX_VM_COUNT}. Usage: /${commandPrefix}vm create [count]`
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

        let regionsRes, imagesRes;
        try {
          [regionsRes, imagesRes] = await Promise.all([
            axios.get(`${process.env.PROVISIONER_URL}/v1/regions`, {
              headers: { 'Authorization': `${process.env.PROVISIONER_API_TOKEN}` }
            }),
            axios.get(`${process.env.PROVISIONER_URL}/v1/get-images`)
          ]);
      } catch (error) {
        // Normalise first: the raw axios error carries config.headers.Authorization
        // (the provisioner token) — axiosError() drops it, keeping only data/status/message.
        log.error('Error fetching regions or images:', axiosError(error));
        await app.client.chat.postEphemeral({
          channel: event.channel_id,
          user: event.user_id,
          text: 'Error fetching regions or images. Please try again later.'
        });
        return;
      }
        const regions = regionsRes.data || [];
        const images = imagesRes.data.images || [];

        // When creating multiple VMs, filter regions to those with small enough instance types
        const filteredRegions = vmCount > 1
          ? regions.filter(r => r.available_instance_types?.some(t => t.memory_mb <= MAX_VM_RAM_MB))
          : regions;

        // Load the user's saved profiles for the picker. Best-effort: a failure just
        // yields no picker, never blocks creation.
        let profileNames = [];
        try {
          const info = await app.client.users.info({ user: event.user_id });
          profileNames = Object.keys(await listProfiles(info.user.profile.email)).sort();
        } catch (error) {
          log.error('Failed to load profiles for create modal', error);
        }

        await app.client.views.update({
          view_id: result.view.id,
          view: vmCreateModal({ regions: filteredRegions, images, servers: [], metaData: JSON.stringify({ channel_id: event.channel_id, vmCount, profiles: profileNames }), vmCount, profiles: profileNames })
        });
      break;
    case 'list': {
      const servers = [];
      const blocks = [];

      servers.push(...await libvirt.listServers({ app, body }));
      servers.sort(sortByCreatedAtAsc);

      // Check if there are any servers
      if (servers.length) {
        for (const server of servers) {
          const description = server.tags.description || 'No description provided';
          const cdeToken = server.tags.cde_token || null;
          const cloneRepo = server.tags.clone_repo || null;
          const createdDate = formatCreatedDate(server.tags.created_at);
          const buttonsArray = [
              { text: "Start", actionId: `button_start_libvirt`, value: JSON.stringify({ serverName: server.serverName, region: server.region }) },
              { text: "Stop", actionId: `button_stop_libvirt`, value: JSON.stringify({ serverName: server.serverName, region: server.region }) },
              { text: "Delete", actionId: `button_delete_libvirt`, value: JSON.stringify({ serverName: server.serverName, region: server.region }) },
              { text: "Edit Description", actionId: `button_edit_libvirt`, value: JSON.stringify({ serverName: server.serverName, region: server.region, tags: server.tags }) }
          ];

          // Build header text with optional CDE URL
          let headerText = `Server: ${server.serverName}\nRegion: ${server.region}\nDescription: ${description}\nStatus: ${server.status}\nCreated: ${createdDate}\nRepo: ${cloneRepo || 'None'}`;
          if (cdeToken) {
              // The tunnel_endpoint tag records which sish host this VM's
              // tunnel actually connects to; VMs created before regional
              // tunnels have no tag and live on the legacy central endpoint.
              const tunnelHost = server.tags.tunnel_endpoint || DEFAULT_TUNNEL_ENDPOINT;
              const cdeUrl = cdeAccessUrl(server.serverName, tunnelHost, cdeToken);
              headerText += `\nAccess: <${cdeUrl}|Cloud Development Environment>`;
          }

          // Build buttons and add them to blocks
          const buttonBlock = buttonBuilder({
              buttonsArray,
              headerText,
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
    case 'profile': {
      const sub = args[1];

      // Open the create/update modal
      if (sub === 'new' || sub === 'create') {
        await app.client.views.open({
          trigger_id: body.trigger_id,
          view: vmProfileModal({ metaData: JSON.stringify({ channel_id: event.channel_id }) })
        });
        return;
      }

      let email;
      try {
        const info = await app.client.users.info({ user: event.user_id });
        email = info.user.profile.email;
      } catch (error) {
        log.error('Failed to resolve user email for profiles', error);
        await app.client.chat.postEphemeral({ channel: event.channel_id, user: event.user_id, text: 'Failed to load your profiles.' });
        return;
      }

      if (sub === 'delete') {
        const name = args.slice(2).join(' ').trim();
        if (!name) {
          await app.client.chat.postEphemeral({ channel: event.channel_id, user: event.user_id, text: `Usage: /${commandPrefix}vm profile delete <name>` });
          return;
        }
        try {
          await deleteProfile(email, name);
          await app.client.chat.postEphemeral({ channel: event.channel_id, user: event.user_id, text: `Deleted profile: ${name}` });
        } catch (error) {
          log.error('Failed to delete profile', error);
          await app.client.chat.postEphemeral({ channel: event.channel_id, user: event.user_id, text: `Failed to delete profile: ${name}` });
        }
        return;
      }

      // Default: list the user's profiles with delete + new-profile controls
      let profiles;
      try {
        profiles = await listProfiles(email);
      } catch (error) {
        log.error('Failed to list profiles', error);
        await app.client.chat.postEphemeral({ channel: event.channel_id, user: event.user_id, text: 'Failed to load your profiles.' });
        return;
      }

      const names = Object.keys(profiles).sort();
      const blocks = [
        { type: 'section', text: { type: 'mrkdwn', text: names.length ? '*Your VM profiles*' : "You don't have any profiles yet." } }
      ];
      for (const name of names) {
        const keys = Object.keys(profiles[name]?.env || {});
        // Show the keys (never values) so a profile is inspectable at a glance; cap the
        // rendered list so a huge profile can't blow past Slack's text limits.
        const shown = keys.slice(0, 12).join(', ');
        const keyText = keys.length
          ? `${shown}${keys.length > 12 ? `, +${keys.length - 12} more` : ''}`
          : '_no env vars_';
        blocks.push(
          { type: 'section', text: { type: 'mrkdwn', text: `*${name}*\n${keyText}` } },
          {
            type: 'actions',
            elements: [
              { type: 'button', text: { type: 'plain_text', text: 'Edit' }, action_id: 'button_profile_edit', value: JSON.stringify({ name }) },
              { type: 'button', text: { type: 'plain_text', text: 'Copy' }, action_id: 'button_profile_copy', value: JSON.stringify({ name }) },
              {
                type: 'button', text: { type: 'plain_text', text: 'Delete' }, style: 'danger',
                action_id: 'button_profile_delete', value: JSON.stringify({ name }),
                confirm: {
                  title: { type: 'plain_text', text: 'Delete profile?' },
                  text: { type: 'mrkdwn', text: `This permanently deletes *${name}*.` },
                  confirm: { type: 'plain_text', text: 'Delete' },
                  deny: { type: 'plain_text', text: 'Cancel' },
                  style: 'danger'
                }
              }
            ]
          }
        );
      }
      blocks.push({
        type: 'actions',
        elements: [
          { type: 'button', text: { type: 'plain_text', text: 'New profile' }, action_id: 'button_profile_new' }
        ]
      });

      await app.client.chat.postEphemeral({
        channel: event.channel_id, user: event.user_id, text: 'Your VM profiles', blocks
      });
      return;
    }
    default:
      await app.client.chat.postEphemeral({
        channel: event.channel_id,
        user: event.user_id,
        text: `Access your existing VMs with: <${process.env.GUACAMOLE_CONNECTION_URL}|Guacamole>\n\nAvailable subcommands:\n• /${commandPrefix}vm create [count] - Create one or more VMs (default: 1, max: ${MAX_VM_COUNT})\n• /${commandPrefix}vm list - List existing VMs\n• /${commandPrefix}vm start <vm name> - Start a VM\n• /${commandPrefix}vm stop <vm name> - Stop a VM\n• /${commandPrefix}vm delete <vm name> - Delete a VM\n• /${commandPrefix}vm edit <vm name> - Edit a VM Description\n• /${commandPrefix}vm profile - List your reusable env-var profiles\n• /${commandPrefix}vm profile new - Create a profile\n• /${commandPrefix}vm profile delete <name> - Delete a profile`,
      });
    }
  }
}
