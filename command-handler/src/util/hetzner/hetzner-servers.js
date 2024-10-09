import logger from '../logger.js';
import axios from 'axios';
import 'dotenv/config';
import formatUser from '../format-user.js';
import getDevices from '../tailscale/get-devices-info.js';
import getServer from './get-servers.js';
import tailscale from '../tailscale/tailscale.js';
import configUserData from '../get-user-data.js';
import buttonBuilder from '../button-builder.js';
import axiosError from '../axios-error-handler.js';
import getHetznerImages from './get-hetzner-images.js';
import { uniqueNamesGenerator, colors, animals } from 'unique-names-generator';

const log = logger();

const delay = (ms) => {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export default {
    //create the hetzner server
    createServer: async ({ app, body, imageID, imageName, region, serverType }) => {
    //auto generate the name
    const serverName = uniqueNamesGenerator({ 
        dictionaries: [ colors, animals ],
        separator: '-'
      });

      // Call the users.info method using the WebClient
      let info;
      try {
        info = await app.client.users.info({
          user: body.user.id
        });
      } catch (error) {
        log.error('There was an error calling the user.info method in slack', error);

        app.client.chat.postEphemeral({
          channel: `${body.channel.id}`,
          user: `${body.user.id}`,
          text: `Failed to get user info from slack`
        });

        return;
      }
    
      const userEmail = formatUser(info.user.profile.email);

      //post a status message
      app.client.chat.postEphemeral({
        channel: `${body.channel.id}`,
        user: `${body.user.id}`,
        text: `Creating the server with image: ${imageName} This will take about 5 minutes.`
      });
      
      //hetzner api to create the server
      let serverRes;
      try {
        serverRes = await axios.post('https://api.hetzner.cloud/v1/servers', 
          {
            "automount": false,
            "image": imageID,
            "labels": {
              "owner": userEmail
            },
            "location": region,
            "name": serverName,
            "public_net": {
              "enable_ipv4": true,
              "enable_ipv6": false
            },
            "server_type": serverType,
            "start_after_create": true,
            "user_data": configUserData(serverName)
          }, {
          headers: {
            'Authorization': `Bearer ${process.env.HETZNER_API_TOKEN}`,
            'Content-Type': 'application/json'
          }
        });
      } catch (error) {
        log.error('There was an error creating the server', axiosError(error));

        app.client.chat.postEphemeral({
          channel: `${body.channel.id}`,
          user: `${body.user.id}`,
          text: `Failed to create a server in hetzner.`
        });

        return;
      }

      let maxRetries = 20;
      let attempts;

      for (attempts = 1; attempts <= maxRetries; attempts++) {
        //wait 30 seconds
        await delay(1000 * 30);

        const server = await getServer(serverRes.data.server.id);

        if (server.data.server.status === 'running') {
          break;
        } else {
          log.info(`Attempt ${attempts} Failed. Backing off for 30 seconds`);
        }
      }

      if (attempts === maxRetries) {
        try {
          throw new Error(`Failed to initialize server in hetzner after ${attempts} retries`);
        } catch (error) {
            log.error({message: error.message, stack: error.stack});
            app.client.chat.postEphemeral({
              channel: `${body.channel.id}`,
              user: `${body.user.id}`,
              text: `Failed to initialize server in Hetzner`
            });
            return;
        } 
      }

    maxRetries = 4;  
    for (attempts = 1; attempts <= maxRetries; attempts++) {
        //wait 30 seconds
        await delay(1000 * 30);
        try {
          //get servers and info from tailscale
          const { deviceId } = await getDevices(serverName);
  
          await tailscale.setTags({ userEmail, deviceId });
          break;
        } catch (error) {
            log.info(`Attempt ${attempts} Failed. Backing off for 30 seconds`)
          }
      }

      if (attempts === maxRetries) {
        try {
          throw new Error(`Failed to set tags in tailscale after ${attempts} retries`);
        } catch (error) {
            log.error({message: error.message, stack: error.stack});
            app.client.chat.postEphemeral({
              channel: `${body.channel.id}`,
              user: `${body.user.id}`,
              text: `Failed to set tags in tailscale`
            });
            return;
        }
      }

      //get servers and info from tailscale
      const { deviceIP } = await getDevices(serverName);

      //return info for tailscale
      app.client.chat.postEphemeral({
        channel: `${body.channel.id}`,
        user: `${body.user.id}`,
        text: `Cloud: hetzner\nServer: ${serverName}\nRegion: ${region}\nStatus: Created\nConnect: https://login.tailscale.com/admin/machines/${deviceIP}`
      });
    },

    //delete a hetzner server
    deleteServer: async ({ app, body, serverName }) => {
        //get server from hetzner
        const data = await getServer();

        //get servers from tailscale
        const { deviceId } = await getDevices(serverName)
        
        
        //get server id from hetzner
        let vmid = null
        for (const server of data.data.servers) {
          if (server.name === serverName) {
            vmid = server.id;
          }
        }

        //delete the device from tailscale
        await tailscale.removeDevice({ deviceId })
        .catch(error => {
          log.error('Failed to delete device in tailscale', axiosError(error));

          app.client.chat.postEphemeral({
            channel: `${body.channel.id}`,
            user: `${body.user.id}`,
            text: `Failed to delete Server: ${serverName} from Tailscale`
          });
        });

        //delete server from hetzner
        try {
          await axios.delete(`https://api.hetzner.cloud/v1/servers/${vmid}`, {
            headers: {
              'Authorization': `Bearer ${process.env.HETZNER_API_TOKEN}`
            }
          });

          app.client.chat.postEphemeral({
            channel: `${body.channel.id}`,
            user: `${body.user.id}`,
            text: `Server: ${serverName} has been deleted.`
          });
        } catch (error) {
          log.error('Failed to delete the server in hetzner', axiosError(error));

          app.client.chat.postEphemeral({
            channel: `${body.channel.id}`,
            user: `${body.user.id}`,
            text: `Failed to delete Server: ${serverName} from Hetzner.`
          });
        }  
    },

    //list the servers
    listServers: async ({ app, body }) => {
        const data = await getServer();
        const servers = [];

        // Call the users.info method using the WebClient
        const info = await app.client.users.info({
        user: body.user.id
        })
        .catch(error => {
        log.error('There was an error getting user.info from slack', error);
        });

        const userEmail = formatUser(info.user.profile.email);

        if (!data) {
          app.client.chat.postEphemeral({
            channel: `${body.channel.id}`,
            user: `${body.user.id}`,
            text: `Failed to get server data from hetzner`
          });
          return [];
        }
        
        //list the servers and build the buttons
        for (const server of data.data.servers) {
            if (server.labels.owner === userEmail) {
                const { deviceIP } = await getDevices(server.name);

              servers.push({
                cloud: "hetzner",
                serverName: `${server.name}`,
                serverID: `${server.id}`,
                region: `${server.datacenter.location.name}`,
                status: `${server.status}`,
                connect: `https://login.tailscale.com/admin/machines/${deviceIP}`
              });
            }
        }

        return servers;
    },

    //start a hetzner server
    startServer: async ({ app, body, vmID }) => {
        try {
          await axios.post(`https://api.hetzner.cloud/v1/servers/${vmID}/actions/poweron`, null, {
            headers: {
              'Authorization': `Bearer ${process.env.HETZNER_API_TOKEN}`
            }
        });

        app.client.chat.postEphemeral({
          channel: `${body.channel.id}`,
          user: `${body.user.id}`,
          text: `Server Id: ${vmID} has been started.`
          });

        } catch (error) {
          log.error('Error starting the server', axiosError(error));
          app.client.chat.postEphemeral({
              channel: `${body.channel.id}`,
              user: `${body.user.id}`,
              text: `Server Id: ${vmID} failed to start.`
          });

          return;
        }
    },

    //stop a hetzner server
    stopServer: async ({ app, body, vmID }) => {
        try {
          await axios.post(`https://api.hetzner.cloud/v1/servers/${vmID}/actions/poweroff`, null, {
            headers: {
              'Authorization': `Bearer ${process.env.HETZNER_API_TOKEN}`
            }
          });

          app.client.chat.postEphemeral({
            channel: `${body.channel.id}`,
            user: `${body.user.id}`,
            text: `Server Id: ${vmID} has been stopped.`
          });
        } catch (error) {
          log.error('Error stopping the server', axiosError(error));
          app.client.chat.postEphemeral({
              channel: `${body.channel.id}`,
              user: `${body.user.id}`,
              text: `Server Id: ${vmID} failed to stop.`
          });
          
          return;
        }
    },

    //code to build button UI
    selectImage: async ({app, body, data }) => {
      const buttonsArray = [];
      //get the hetzner images
      const images = await getHetznerImages();

      //return if it fails to get the images.
      if (!images) {
        app.client.chat.postEphemeral({
          channel: `${body.channel.id}`,
          user: `${body.user.id}`,
          text: `Failed to get image data`
        });

        return;
      }

      //build button for user to select
      for (const image of images) {
        data.imageName = image.description;
        data.imageID = image.id;
        buttonsArray.push({ text: image.description, actionId: `button_create_image_hetzner${image.description}`, value: JSON.stringify(data) })
      }

      const buttons = buttonBuilder({ buttonsArray, headerText: 'Select an image', fallbackText: 'unsupported device' });
      app.client.chat.postEphemeral({
        channel: `${body.channel.id}`,
        user: `${body.user.id}`,
        text: 'select an image',
        ...buttons
      });
    },

    selectRegion: async ({app, body }) => {
      const buttonsArray = [];
      //get the regions from the env variable
      const regions = process.env.HETZNER_REGIONS.split(',').map(region => region.trim()).filter(region => region);
      
      //return if it fails to get the regions.
      if (!regions) {
        app.client.chat.postEphemeral({
          channel: `${body.channel.id}`,
          user: `${body.user.id}`,
          text: `Failed to get region data`
        });

        return;
      }

      //build button for user to select
      for (const region of regions) {
        buttonsArray.push({ text: region, actionId: `button_select_hetzner_server${region}`, value: JSON.stringify({ region }) });
      }
      const buttons = buttonBuilder({ buttonsArray, headerText: 'Select a region', fallbackText: 'unsupported device' });
      app.client.chat.postEphemeral({
        channel: `${body.channel.id}`,
        user: `${body.user.id}`,
        text: 'select a region',
        ...buttons
        });
    },

    selectServer: async ({app, body, data }) => {
      const buttonsArray = [];
      const serverTypes = process.env.HETZNER_SERVER_TYPES.split(',').map(server => server.trim()).filter(server => server);

      for (const serverType of serverTypes) {
        data.serverType = serverType;
        buttonsArray.push({ text: serverType, actionId: `button_select_hetzner_image_${serverType}`, value: JSON.stringify(data) });
      };
      const buttons = buttonBuilder({ buttonsArray, headerText: 'Select a server', fallbackText: 'unsupported device' });
      app.client.chat.postEphemeral({
        channel: `${body.channel.id}`,
        user: `${body.user.id}`,
        text: 'select a server',
        ...buttons
      });
    }
}