import logger from '../logger.js';
import 'dotenv/config';
import axios from 'axios';
import buttonBuilder from "../button-builder.js";
import configUserData from "../get-user-data.js";
import axiosError from '../axios-error-handler.js';
import { uniqueNamesGenerator, colors, animals } from 'unique-names-generator';

const log = logger();

export default {
    createServer: async({ app, body, imageName, region, instanceType }) => {
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
    
        const userEmail = info.user.profile.email;

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
                        "owner": userEmail,
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

            app.client.chat.postEphemeral({
            channel: `${body.channel.id}`,
            user: `${body.user.id}`,
            text: `Failed to create a server.`
            });

            return;
        }

        //return info for connection
        app.client.chat.postEphemeral({
            channel: `${body.channel.id}`,
            user: `${body.user.id}`,
            text: `Server: ${serverName}\nStatus: Created\nRegion: ${region}`
        });
    },

    deleteServer: async ({ app, body, serverName, region }) => {
        try {
            await axios.delete(`${process.env.PROVISIONER_URL}/v1/delete`, {
                data: { 
                    "vm_name": serverName,
                    "region_name": region 
                },
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
              channel: `${body.channel.id}`,
              user: `${body.user.id}`,
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
                status: `${server.state}`
            });
            }
        }

        return servers;
    },

    startServer: async({ app, body, serverName, region }) => {
        try {
            await axios.post(`${process.env.PROVISIONER_URL}/v1/start`, {
                "vm_name": serverName,
                "region_name": region
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

    stopServer: async({ app, body, serverName, region }) => {
        try {
            await axios.post(`${process.env.PROVISIONER_URL}/v1/stop`, {
                "vm_name": serverName,
                "region_name": region
            }, {
                headers: {
                'Authorization': `${process.env.PROVISIONER_API_TOKEN}`
                }
            });
  
            app.client.chat.postEphemeral({
              channel: `${body.channel.id}`,
              user: `${body.user.id}`,
              text: `Server: ${serverName} has been Stopped.`
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

    selectRegion: async ({app, body }) => {
        const buttonsArray = [];
        //get the regions from the env variable
        const response = await axios.get(`${process.env.PROVISIONER_URL}/v1/regions`, {
            headers: {
              'Authorization': `${process.env.PROVISIONER_API_TOKEN}`
            },
            timeout: 1000 * 60 * 5
          })
          .catch(error => {
            log.error('Failed to get regions from libvirt', axiosError(error));
        });

        const regions = response?.data;
        
        //return if it fails to get a response from libvirt.
        if (!regions) {
        app.client.chat.postEphemeral({
            channel: `${body.channel.id}`,
            user: `${body.user.id}`,
            text: `Failed to get region data from libvirt`
        });

        return;
        }

        //build button for user to select
        for (const region of regions) {
        buttonsArray.push({ text: region.region_name, actionId: `button_select_libvirt_server${region.region_name}`, value: JSON.stringify({ region: region.region_name, instances: region.available_instance_types }) });
        }
        const buttons = buttonBuilder({ buttonsArray, headerText: 'Select a region', fallbackText: 'unsupported device' });
        app.client.chat.postEphemeral({
        channel: `${body.channel.id}`,
        user: `${body.user.id}`,
        text: 'select a region',
        ...buttons
        });
    },
    
    selectImage: async({ app, body, data }) => {
        //get the libvirt images
        let images = [];
        // Fetch tags from the repository
        try {
            const res = await axios.get(`${process.env.PROVISIONER_URL}/v1/get-images`);
            images = res.data.images;
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
            data.imageName = image;
            buttonsArray.push({ text: image, actionId: `button_create_image_libvirt_${image}`, value: JSON.stringify(data) })
        }

        const buttons = buttonBuilder({ buttonsArray, headerText: 'Select an image', fallbackText: 'unsupported device' });
        app.client.chat.postEphemeral({
            channel: `${body.channel.id}`,
            user: `${body.user.id}`,
            text: 'select an image',
            ...buttons
        });
    },

    selectServer: async ({app, body, data }) => {
        const buttonsArray = [];

        for (const serverType of data.instances) {
            data.instanceType = serverType.instance_type;
            buttonsArray.push({ text: serverType.instance_type, actionId: `button_select_libvirt_image_${serverType.instance_type}`, value: JSON.stringify(data) });
        };
        const buttons = buttonBuilder({ buttonsArray, headerText: 'Select a server', fallbackText: 'unsupported device' });
        app.client.chat.postEphemeral({
        channel: `${body.channel.id}`,
        user: `${body.user.id}`,
        text: 'select a server',
        ...buttons
        });
    }
};
