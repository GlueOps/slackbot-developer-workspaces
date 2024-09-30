import { 
    DescribeSecurityGroupsCommand, 
    EC2Client, RunInstancesCommand,
    StopInstancesCommand,
    StartInstancesCommand,
    TerminateInstancesCommand
} from "@aws-sdk/client-ec2";
import logger from '../logger.js';
import axios from 'axios';
import 'dotenv/config';
import formatUser from '../format-user.js';
import getDevices from '../get-devices-info.js';
import getInstance from "./get-instances.js";
import configUserData from "../get-user-data.js";
import getAwsImages from "./get-aws-images.js";
import axiosError from '../axios-error-handler.js';
import { uniqueNamesGenerator, colors, animals } from 'unique-names-generator';

const log = logger();

const delay = (ms) => {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

const instanceType = 't3a.large';

export default {
    getSecurityGroups: async({ app, body }) => {
        const client = new EC2Client();
        try {
            const { SecurityGroups } = await client.send(
            new DescribeSecurityGroupsCommand({}),
            );

            const securityGroupList = SecurityGroups.slice(0, 9)
            .map((sg) => ` • ${sg.GroupId}: ${sg.GroupName}`)
            .join("\n");

            console.log(
            "Hello, Amazon EC2! Let's list up to 10 of your security groups:",
            );
            console.log(securityGroupList);
        } catch (err) {
            console.error(err);
        }
    },

    createServer: async({ app, body, imageName, ami }) => {
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
        // This example launches an instance using the specified AMI, instance type, security group, subnet, block device mapping, and tags.
        const client = new EC2Client();
        const input = {
            "BlockDeviceMappings": [
                {
                    "DeviceName": "/dev/xvda",
                    "Ebs": {
                        "VolumeSize": 52,
                        "VolumeType": "gp3"
                    }
                }
            ],
            "ImageId": ami,
            "InstanceType": instanceType,
            // "KeyName": "my-key-pair",
            "MaxCount": 1,
            "MinCount": 1,
            "SecurityGroupIds": [
                "sg-0b5b0e1fb1f73dbba"
            ],
            // "SubnetId": "subnet-6e7f829e",
            "TagSpecifications": [
                {
                    "ResourceType": "instance",
                    "Tags": [
                        {
                            "Key": "Name",
                            "Value": serverName
                        },
                        {
                            "Key": "Owner",
                            "Value": userEmail
                        },
                    ]
                }
            ],
            "UserData": Buffer.from(configUserData(serverName)).toString('base64'),
        };
        const command = new RunInstancesCommand(input);
        await client.send(command);

        let maxRetries = 20;
        let attempts;

        for (attempts = 1; attempts <= maxRetries; attempts++) {
            //wait 30 seconds
            await delay(1000 * 30);

            const server = await getInstance({ serverName });

            if (server[0].State.Name === 'running') {
            break;
            } else {
            log.info(`Attempt ${attempts} Failed. Backing off for 30 seconds`);
            }
            break;
        }

        if (attempts === maxRetries) {
            try {
            throw new Error(`Failed to initialize server in aws after ${attempts} retries`);
            } catch (error) {
                log.error({message: error.message, stack: error.stack});
                app.client.chat.postEphemeral({
                channel: `${body.channel.id}`,
                user: `${body.user.id}`,
                text: `Failed to initialize server in aws`
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
    
            await axios.post(`https://api.tailscale.com/api/v2/device/${deviceId}/tags`, 
                {
                "tags": [
                    `tag:${userEmail}`
                ]
                }, {
                headers: {
                'Authorization': `Bearer ${process.env.TAILSCALE_API_TOKEN}`,
                'Content-Type': 'application/json'
                }
            });
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
            text: `The server has been created: https://login.tailscale.com/admin/machines/${deviceIP}`
        });
    },

    deleteServer: async ({ app, body, instanceId, serverName }) => {
        //get servers from tailscale
        const { deviceId } = await getDevices(serverName)

        //delete the device from tailscale
        await axios.delete(`https://api.tailscale.com/api/v2/device/${deviceId}`, {
          headers: {
            'Authorization': `Bearer ${process.env.TAILSCALE_API_TOKEN}`
          }
        })
        .catch(error => {
          log.error('Failed to delete device in tailscale', axiosError(error));

          app.client.chat.postEphemeral({
            channel: `${body.channel.id}`,
            user: `${body.user.id}`,
            text: `Failed to delete Server: ${serverName} from Tailscale`
          });
        });

        //terminate the server from aws
        const client = new EC2Client();
        const command = new TerminateInstancesCommand({
            InstanceIds: [instanceId],
        });
        try {
            await client.send(command);
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
        // Call the users.info method using the WebClient
        const info = await app.client.users.info({
        user: body.user.id
        })
        .catch(error => {
        log.error('There was an error getting user.info from slack', error);
        });

        const userEmail = formatUser(info.user.profile.email);

        //get the instances from aws
        const instances = await getInstance({ userEmail });

        app.client.chat.postEphemeral({
            channel: `${body.channel.id}`,
            user: `${body.user.id}`,
            text: `Servers in AWS:`
          });

        // list the servers and build the buttons
        for (const instance of instances) {
            //get the tag name from the instance
            const serverName = instance.Tags.find(tag => tag.Key === 'Name')?.Value;
            const { deviceIP } = await getDevices(serverName);

            app.client.chat.postEphemeral({
            channel: `${body.channel.id}`,
            user: `${body.user.id}`,
            blocks: [
                {
                "type": "section",
                "text": {
                    "type": "mrkdwn",
                    "text": `Server: ${serverName}\nServer id: ${instance.InstanceId}\nStatus: ${instance.State.Name}\nConnect: https://login.tailscale.com/admin/machines/${deviceIP}`
                }
                },
                {
                "type": "actions",
                "elements": [
                    {
                    "type": "button",
                    "text": {
                        "type": "plain_text",
                        "text": "Start"
                    },
                    "action_id": `button_start_aws_${instance.InstanceId}`
                    },
                    {
                    "type": "button",
                    "text": {
                        "type": "plain_text",
                        "text": "Stop"
                    },
                    "action_id": `button_stop_aws_${instance.InstanceId}`
                    },
                    {
                    "type": "button",
                    "text": {
                        "type": "plain_text",
                        "text": "Delete"
                    },
                    "action_id": `button_delete_aws_${instance.InstanceId}_${serverName}`
                    }
                ]
                }
            ],
            text: "VM options"
            })
        }
        // example id: to-describe-an-amazon-ec2-instance-1529025982172
    },

    startServer: async({ app, body, instanceId }) => {
        const client = new EC2Client();
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

    stopServer: async({ app, body, instanceId }) => {
        const client = new EC2Client();
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
    //get the aws images
      const images = await getAwsImages();

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
      app.client.chat.postEphemeral({
        channel: `${body.channel.id}`,
        user: `${body.user.id}`,
        text: `Select an image:`
      });
      for (const image of images) {
        app.client.chat.postEphemeral({
        channel: `${body.channel.id}`,
        user: `${body.user.id}`,
        blocks: [
            {
            "type": "actions",
            "elements": [
                {
                "type": "button",
                "text": {
                    "type": "plain_text",
                    "text": `${image.Name}`
                },
                "action_id": `button_create_image_aws_${image.Name}_${image.ImageId}`
                },
            ]
            }
        ],
        text: "Select an image:"
        });
      }
    }
};