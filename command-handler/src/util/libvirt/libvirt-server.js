import logger from '../logger.js';
import 'dotenv/config';
import tailscale from "../tailscale/tailscale.js";
import formatUser from '../format-user.js';
import getDevices from '../tailscale/get-devices-info.js';
import buttonBuilder from "../button-builder.js";
import executeSSHCommand from './ssh-connection.js';
import configUserData from "../get-user-data.js";
import fs from 'fs';
import { uniqueNamesGenerator, colors, animals } from 'unique-names-generator';

const log = logger();
const nodes = JSON.parse(process.env.NODES);

const delay = (ms) => {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export default {
    createServer: async({ app, body, imageName }) => {
        const node = nodes[0];
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
        const scriptPath = '../command-handler/src/util/libvirt/create-server.sh';
        const variables = {
            IMAGE: imageName,
            SERVER_NAME: serverName,
            USER_DATA: configUserData(serverName)
        };
        
        let script = fs.readFileSync(scriptPath, 'utf8');

        // Replace the placeholders with actual values
        for (const [key, value] of Object.entries(variables)) {
            const placeholder = `{{${key}}}`;
            script = script.replace(new RegExp(placeholder, 'g'), value);
        }

        console.log(await executeSSHCommand(node, script))

        let attempts;

        let maxRetries = 1;  
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

        // if (attempts === maxRetries) {
        //     try {
        //     throw new Error(`Failed to set tags in tailscale after ${attempts} retries`);
        //     } catch (error) {
        //         log.error({message: error.message, stack: error.stack});
        //         app.client.chat.postEphemeral({
        //         channel: `${body.channel.id}`,
        //         user: `${body.user.id}`,
        //         text: `Failed to set tags in tailscale`
        //         });
        //         return;
        //     }
        // }

        // Read the JSON file
        const data = JSON.parse(await executeSSHCommand(node, 'if [ -f /var/lib/libvirt/images/vmData.json ]; then cat /var/lib/libvirt/images/vmData.json; else echo "{}"; fi'));

        // Modify the JSON data
        data[serverName] = {Owner: userEmail}; // Add or modify your JSON data

        await executeSSHCommand(node, `echo '${JSON.stringify(data)}' | sudo tee /var/lib/libvirt/images/vmData.json`);


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
        const node = nodes[0];
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

        const scriptPath = '../command-handler/src/util/libvirt/remove-server.sh';
        const variables = {
            SERVER_NAME: serverName,
        };
        
        let script = fs.readFileSync(scriptPath, 'utf8');

        // Replace the placeholders with actual values
        for (const [key, value] of Object.entries(variables)) {
            const placeholder = `{{${key}}}`;
            script = script.replace(new RegExp(placeholder, 'g'), value);
        }

        console.log(script)
        try {
            console.log(await executeSSHCommand(node, script))
            app.client.chat.postEphemeral({
            channel: `${body.channel.id}`,
            user: `${body.user.id}`,
            text: `Server: ${serverName} has been deleted.`
            });
        } catch (error) {
          log.error('Failed to delete the server in aws', {errorStack: error.stack, message: error.message});

          app.client.chat.postEphemeral({
            channel: `${body.channel.id}`,
            user: `${body.user.id}`,
            text: `Failed to delete Server: ${serverName} from aws.`
          });
        } 
    },

    listServers: async({ app, body }) => {
        const node = nodes[0];
        // Call the users.info method using the WebClient
        const servers = [];
        const info = await app.client.users.info({
        user: body.user.id
        })
        .catch(error => {
        log.error('There was an error getting user.info from slack', error);
        });

        const userEmail = formatUser(info.user.profile.email);

        // Read the JSON file
        const data = JSON.parse(await executeSSHCommand(node, 'if [ -f /var/lib/libvirt/images/vmData.json ]; then cat /var/lib/libvirt/images/vmData.json; else echo "{}"; fi'));

        for (const server in data) {
            if (data.hasOwnProperty(server)) { // Check if the key belongs to the object itself
              const owner = data[server].Owner; // Access the Owner value
              const { deviceIP } = await getDevices(server);
              
              // Check if the Owner matches the search value
              if (owner === userEmail) {
                servers.push({
                    cloud: "libvirt",
                    serverName: `${server}`,
                    status: `-`,
                    connect: `https://login.tailscale.com/admin/machines/${deviceIP}`
                });
              }
            }
        }

        return servers;
    },

    startServer: async({ app, body, instanceId, region }) => {
        const client = new EC2Client({ region });
        const command = new StartInstancesCommand({
            InstanceIds: [instanceId],
        });
        try {
            await client.send(command);
            app.client.chat.postEphemeral({
                channel: `${body.channel.id}`,
                user: `${body.user.id}`,
                text: `Server Id: ${instanceId} has been started.`
            });
        } catch (error) {
            log.error('error starting aws server', {errorStack: error.stack, message: error.message});
        }
    },

    stopServer: async({ app, body, instanceId, region }) => {
        const client = new EC2Client({ region });
        const command = new StopInstancesCommand({
            InstanceIds: [instanceId],
        });
        try {
            await client.send(command);
            app.client.chat.postEphemeral({
                channel: `${body.channel.id}`,
                user: `${body.user.id}`,
                text: `Server Id: ${instanceId} has been stopped.`
            });
        } catch (error) {
            log.error('error stoping aws server', {errorStack: error.stack, message: error.message});
        }
    },

    selectImage: async({ app, body }) => {
        //get the libvirt images
        const images = [];
        for (const node of nodes) {
            try {
                // Execute the command and trim the output
                const output = await executeSSHCommand(node, 'ls /var/lib/libvirt/templates');
                // Split the output by newlines and trim each line, then push the result into images
                const trimmedImages = output.split('\n').map(image => image.trim()).filter(image => image); // Filter out empty lines
                images.push(...trimmedImages); // Spread the trimmed array into images
            } catch (error) {
                log.error(`Error executing command on ${node.host}:`, error.message);
            }
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

    // selectServer: async ({app, body, data }) => {
    //     const instances = process.env.AWS_INSTANCES.split(',').map(instance => instance.trim()).filter(instance => instance);
    //     const buttonsArray = [];
  
    //     for (const instance of instances) {
    //         data.instanceType = instance;
    //         buttonsArray.push({ text: instance, actionId: `button_select_aws_image_${instance}`, value: JSON.stringify(data) });
    //     };
    //     const buttons = buttonBuilder({ buttonsArray, headerText: 'Select an instance', fallbackText: 'unsupported device' });
    //     app.client.chat.postEphemeral({
    //         channel: `${body.channel.id}`,
    //         user: `${body.user.id}`,
    //         text: 'select an instance',
    //         ...buttons
    //     });
    // }
};