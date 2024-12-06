import logger from '../logger.js';
import 'dotenv/config';
import axios from 'axios';
import tailscale from "../tailscale/tailscale.js";
import formatUser from '../format-user.js';
import getDevices from '../tailscale/get-devices-info.js';
import buttonBuilder from "../button-builder.js";
import configUserData from "../get-user-data.js";
import axiosError from '../axios-error-handler.js';
import { uniqueNamesGenerator, colors, animals } from 'unique-names-generator';

const log = logger();

const delay = (ms) => {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export default {
    createServer: async({ app, body, imageName }) => {
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

        let serverRes;
        try {
            serverRes = await axios.post(`${process.env.PROVISIONER_URL}/v1/create`, 
                {
                    "vm_name": serverName,
                    "tags": {
                        "owner": {
                        "name": userEmail
                        }
                    },
                    "user_data": Buffer.from(configUserData(serverName)).toString('base64'),
                    "image": imageName
                }, {
                headers: {
                    'Authorization': `${process.env.PROVISIONER_API_TOKEN}`,
                    'Content-Type': 'application/json'
                },
                timeout: 1000 * 60 * 2
            });
        } catch (error) {
            log.error('There was an error creating the server', axiosError(error));

            app.client.chat.postEphemeral({
            channel: `${body.channel.id}`,
            user: `${body.user.id}`,
            text: `Failed to create a server.`
            });

            return;
        }
        
        if (serverRes.data !== 'Success') {
            app.client.chat.postEphemeral({
            channel: `${body.channel.id}`,
            user: `${body.user.id}`,
            text: `Failed to create a server.`
            });

            return;
        }
        
        let attempts;

        let maxRetries = 13;  
        for (attempts = 1; attempts <= maxRetries; attempts++) {
            //wait 10 seconds
            await delay(1000 * 10);
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
            text: `Cloud: libvirt\nServer: ${serverName}\nStatus: Created\nConnect: https://login.tailscale.com/admin/machines/${deviceIP}`
        });
    },

    deleteServer: async ({ app, body, serverName }) => {
        //get servers from tailscale
        const { deviceId } = await getDevices(serverName)

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

        try {
            await axios.delete(`${process.env.PROVISIONER_URL}/v1/delete`, {
                data: { "vm_name": serverName },
                headers: {
                    'Authorization': `${process.env.PROVISIONER_API_TOKEN}`
                }
            });
  
            app.client.chat.postEphemeral({
              channel: `${body.channel.id}`,
              user: `${body.user.id}`,
              text: `Server: ${serverName} has been deleted.`
            });
        } catch (error) {
            log.error('Failed to delete the server', axiosError(error));
  
            app.client.chat.postEphemeral({
              channel: `${body.channel.id}`,
              user: `${body.user.id}`,
              text: `Failed to delete Server: ${serverName}.`
            });
        } 
    },

    listServers: async({ app, body }) => {
        const servers = [];
        const info = await app.client.users.info({
        user: body.user.id
        })
        .catch(error => {
        log.error('There was an error getting user.info from slack', error);
        });

        const userEmail = formatUser(info.user.profile.email);

        const response = await axios.get(`${process.env.PROVISIONER_URL}/v1/list`, {
            headers: {
              'Authorization': `${process.env.PROVISIONER_API_TOKEN}`
            },
            timeout: 1000 * 60 * 2
          })
          .catch(error => {
            log.error('Failed to get servers from libvirt', axiosError(error));
        });

        const data = response.data;

        if (!data) {
            app.client.chat.postEphemeral({
              channel: `${body.channel.id}`,
              user: `${body.user.id}`,
              text: `Failed to get server data from libvirt`
            });

            return [];
        }
    
        for (const server of data) {
        
            const owner = server.description.owner.name;

            const { deviceIP } = await getDevices(server.name);
            
            // Check if the Owner matches the search value
            if (owner === userEmail) {
            servers.push({
                cloud: "libvirt",
                serverName: `${server.name}`,
                status: `${server.state}`,
                connect: `https://login.tailscale.com/admin/machines/${deviceIP}`
            });
            }
        }

        return servers;
    },

    startServer: async({ app, body, serverName }) => {
        try {
            await axios.post(`${process.env.PROVISIONER_URL}/v1/start`, {
                "vm_name": serverName
            }, {
                headers: {
                'Authorization': `${process.env.PROVISIONER_API_TOKEN}`
                }
            });
  
            app.client.chat.postEphemeral({
              channel: `${body.channel.id}`,
              user: `${body.user.id}`,
              text: `Server: ${serverName} has been Started.`
            });
        } catch (error) {
            log.error('Failed to start the server', axiosError(error));
  
            app.client.chat.postEphemeral({
              channel: `${body.channel.id}`,
              user: `${body.user.id}`,
              text: `Failed to start Server: ${serverName}.`
            });
        } 
    },

    stopServer: async({ app, body, serverName }) => {
        try {
            await axios.post(`${process.env.PROVISIONER_URL}/v1/stop`, {
                "vm_name": serverName
            }, {
                headers: {
                'Authorization': `${process.env.PROVISIONER_API_TOKEN}`
                }
            });
  
            app.client.chat.postEphemeral({
              channel: `${body.channel.id}`,
              user: `${body.user.id}`,
              text: `Server: ${serverName} has been Stoped.`
            });
        } catch (error) {
            log.error('Failed to stop the server', axiosError(error));
  
            app.client.chat.postEphemeral({
              channel: `${body.channel.id}`,
              user: `${body.user.id}`,
              text: `Failed to stop Server: ${serverName}.`
            });
        } 
    },

    selectImage: async({ app, body }) => {
        //get the libvirt images

        // Fetch tags from the repository
        let images = [];

        try {
            const res = await axios.get('https://api.github.com/repos/GlueOps/codespaces/tags');
            images = res.data.slice(0, 5).map(tag => tag.name);
        } catch (error) {
            log.error('Error fetching tags:', axiosError(error));
        }

        const buttonsArray = [];

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
            buttonsArray.push({ text: image, actionId: `button_create_image_libvirt_${image}`, value: JSON.stringify({ imageName: image }) })
        }

        const buttons = buttonBuilder({ buttonsArray, headerText: 'Select an image', fallbackText: 'unsupported device' });
        app.client.chat.postEphemeral({
            channel: `${body.channel.id}`,
            user: `${body.user.id}`,
            text: 'select an image',
            ...buttons
        });
    },
};