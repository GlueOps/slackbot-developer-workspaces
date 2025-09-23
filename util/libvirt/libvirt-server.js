import logger from '../logger.js';
import 'dotenv/config';
import axios from 'axios';
import configUserData from "../get-user-data.js";
import axiosError from '../axios-error-handler.js';
import { uniqueNamesGenerator, colors, animals } from 'unique-names-generator';

const log = logger();

export default {
    createServer: async({ client, body, imageName, region, instanceType, description }) => {
        //auto generate the name
        const serverName = uniqueNamesGenerator({ 
            dictionaries: [ colors, animals ],
            separator: '-'
        });

        // Call the users.info method using the WebClient
        let info;
        try {
            info = await client.users.info({
            user: body.user.id
            });
        } catch (error) {
            log.error('There was an error calling the user.info method in slack', error);

            await client.chat.postMessage({
            channel: body.user.id,
            text: `Failed to get user info from slack`
            });

            return;
        }
    
        const userEmail = info.user.profile.email;

        //post a status message
        await client.chat.postMessage({
            channel: body.user.id,
            text: `Creating the server with image: ${imageName} This will take about 5 minutes.`
        });

        let serverRes;
        try {
            serverRes = await axios.post(`${process.env.PROVISIONER_URL}/v1/create`, 
                {
                    "vm_name": serverName,
                    "tags": {
                        "owner": userEmail,
                        "description": description || ''
                    },
                    "user_data": Buffer.from(configUserData(serverName)).toString('base64'),
                    "image": imageName,
                    "region_name": region,
                    "instance_type": instanceType
                }, {
                headers: {
                    'Authorization': `${process.env.PROVISIONER_API_TOKEN}`,
                    'Content-Type': 'application/json'
                },
                timeout: 1000 * 60 * 5
            });
        } catch (error) {
            log.error('There was an error creating the server', axiosError(error));

            await client.chat.postMessage({
            channel: body.user.id,
            text: `Failed to create a server.`
            });

            return;
        }

        //return info for connection
        await client.chat.postMessage({
            channel: body.user.id,
            text: `Server: ${serverName}\nStatus: Created\nRegion: ${region}`
        });
    },

    deleteServer: async ({ app, body, serverName, region }) => {
        const channel_id = body.channel ? body.channel.id : body.channel_id;
        const user_id = body.user ? body.user.id : body.user_id;
        try {
            await axios.delete(`${process.env.PROVISIONER_URL}/v1/delete`, {
                data: { 
                    "vm_name": serverName,
                    "region_name": region 
                },
                headers: {
                    'Authorization': `${process.env.PROVISIONER_API_TOKEN}`
                },
                timeout: 1000 * 60 * 2
            });
  
            app.client.chat.postEphemeral({
              channel: channel_id,
              user: user_id,
              text: `Server: ${serverName} has been deleted.`
            });
        } catch (error) {
            log.error('Failed to delete the server', axiosError(error));
  
            app.client.chat.postEphemeral({
              channel: channel_id,
              user: user_id,
              text: `Failed to delete Server: ${serverName}.`
            });
        } 
    },

    listServers: async({ app, body }) => {
        const servers = [];
        const info = await app.client.users.info({
        user: body.user_id
        })
        .catch(error => {
        log.error('There was an error getting user.info from slack', error);
        });

        const userEmail = info.user.profile.email;

        const response = await axios.get(`${process.env.PROVISIONER_URL}/v1/list`, {
            headers: {
              'Authorization': `${process.env.PROVISIONER_API_TOKEN}`
            },
            timeout: 1000 * 60 * 2
          })
          .catch(error => {
            log.error('Failed to get servers from libvirt', axiosError(error));
        });

        const data = response?.data;

        if (!data) {
            app.client.chat.postEphemeral({
              channel: body.channel_id,
              user: body.user_id,
              text: `Failed to get server data from libvirt`
            });

            return [];
        }
    
        for (const server of data) {
            const owner = server.tags.owner;
            // Check if the Owner matches the search value
            if (owner === userEmail) {
            servers.push({
                serverName: `${server.name}`,
                region: `${server.region_name}`,
                tags: server.tags,
                status: `${server.state}`
            });
            }
        }

        return servers;
    },

    startServer: async({ app, body, serverName, region }) => {
        const channel_id = body.channel ? body.channel.id : body.channel_id;
        const user_id = body.user ? body.user.id : body.user_id;
        try {
            await axios.post(`${process.env.PROVISIONER_URL}/v1/start`, {
                "vm_name": serverName,
                "region_name": region
            }, {
                headers: {
                'Authorization': `${process.env.PROVISIONER_API_TOKEN}`
                },
                timeout: 1000 * 60 * 2
            });
  
            app.client.chat.postEphemeral({
              channel: channel_id,
              user: user_id,
              text: `Server: ${serverName} has been Started.`
            });
        } catch (error) {
            log.error('Failed to start the server', axiosError(error));
  
            app.client.chat.postEphemeral({
              channel: channel_id,
              user: user_id,
              text: `Failed to start Server: ${serverName}.`
            });
        } 
    },

    stopServer: async({ app, body, serverName, region }) => {
        const channel_id = body.channel ? body.channel.id : body.channel_id;
        const user_id = body.user ? body.user.id : body.user_id;
        try {
            await axios.post(`${process.env.PROVISIONER_URL}/v1/stop`, {
                "vm_name": serverName,
                "region_name": region
            }, {
                headers: {
                'Authorization': `${process.env.PROVISIONER_API_TOKEN}`
                },
                timeout: 1000 * 60 * 2
            });
  
            app.client.chat.postEphemeral({
              channel: channel_id,
              user: user_id,
              text: `Server: ${serverName} has been Stopped.`
            });
        } catch (error) {
            log.error('Failed to stop the server', axiosError(error));
  
            app.client.chat.postEphemeral({
              channel: channel_id,
              user: user_id,
              text: `Failed to stop Server: ${serverName}.`
            });
        } 
    },

    editServer: async({ client, body, serverName, region, tags }) => {
        const user_id = body.user ? body.user.id : body.user_id;

        try {
            await axios.post(`${process.env.PROVISIONER_URL}/v1/edit-tags`, {
                "vm_name": serverName,
                "region_name": region,
                "tags": {
                    ...tags
                },
            }, {
                headers: {
                'Authorization': `${process.env.PROVISIONER_API_TOKEN}`
                },
                timeout: 1000 * 60 * 2
            });
  
            client.chat.postMessage({
              channel: user_id,
              text: `Server: ${serverName} has been Edited.`
            });
        } catch (error) {
            log.error('Failed to edit the server description', axiosError(error));
  
            client.chat.postMessage({
              channel: user_id,
              text: `Failed to edit Server: ${serverName}.`
            });
        } 
    }
};
