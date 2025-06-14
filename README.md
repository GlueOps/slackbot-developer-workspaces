# slackbot-developer-workspaces

This is the source code for a Slack bot. It is coded in Javascript using bolt.
It has three components: bot, command-handler, and server. The bot is set up
to run in socket mode. The server is a heart-beat monitor and runs on port 5000,
while the bolt server listens on port 3000 by default. Read more in 

# Installation
### Dependencies
- Docker installed
- Slack App setup
- Tailscale Account and configured with API Token to install, add, remove machines
- [Provisioner](https://github.com/GlueOps/provisioner) API Deployed to provision VMs on libvirt

### Steps
1. pull down the latest image from ghcr

2. You can then run the bot `docker run --env-file <path-to-.env-file -d -p 5000:5000 -p 3000:3000 --name dev-bot <ghcr image>`
**If you change the bolt port or the server port, make sure to update that in the docker command**

3. You can find an example.env file in bot/example.env. Steps to generate all the tokens required and set up the bot are below.

# Compile
If you would like to change the source code, or compile the slack Bot yourself:

1. Download the latest Slack Bot release

2. extract the zip folder. You can make modifications to the source code here.

3. Compile the bot code
`docker build -t <DOCKER_IMAGE_NAME> .`

4. You can then run the bot `docker run --env-file <path-to-.env-file -d -p 5000:5000 -p 3000:3000 --name dev-bot <ghcr image>`
**If you change the bolt port or the server port, make sure to update that in the docker command**

5. You can find an example.env file in bot/example.env. Steps to generate all the tokens required and set up the bot are below.

## Set up Slack App
1. You will need to create a [slack app](https://api.slack.com/apps)

2. In the app creation progress, create new app from a manifest:

```json
{
    "display_information": {
        "name": "Dev Bot"
    },
    "features": {
        "bot_user": {
            "display_name": "Dev Bot",
            "always_online": true
        }
    },
    "oauth_config": {
        "scopes": {
            "bot": [
                "channels:history",
                "chat:write",
                "groups:history",
                "im:history",
                "mpim:history",
                "users:read.email",
                "users:read"
            ]
        }
    },
    "settings": {
        "event_subscriptions": {
            "request_url": "<your server's url>/slack/events",
            "bot_events": [
                "message.channels",
                "message.groups",
                "message.im",
                "message.mpim"
            ]
        },
        "interactivity": {
            "is_enabled": true,
            "request_url": "<your server's url>/slack/events"
        },
        "org_deploy_enabled": false,
        "socket_mode_enabled": false,
        "token_rotation_enabled": false
    }
}
```

3. Once you have created your Slack App, in the App credentials under Basic information,
you will find your signing secret.

4. Scroll down to App-Level-Tokens and generate a token with connections:write scope. This will be your app token

5. In the left bar settings menu, Select Install App. This will generate your bot token for you.

## Set up Tailscale

_Note: For the steps below use a service account that has Admin permissions._

1. Navigate to tailscale [admin console](https://login.tailscale.com/admin/machines)

2. In the top menu bar, click DNS. This will give you your Tailnet name.

3. In the top menu bar select Settings.

4. In the left menu bar select keys.

5. Generate an auth key: you will need to give it a description, and select Reusable. The key must be rotated and has a max expiration of 90 days, but can be shortened. Leave Ephemeral, and Tags unchecked and generate the key. This will be your tailscale auth key.

6. Generate an API acess token: you will need to give it a description. The key must be rotated and has a max expiration of 90 days, but can be shortened. This will be your Tailscale api token.

### Setup tailscale ACLs

Here is an example ACL that does the following:

- Machines with `tag:app-prod-provisioner-api` can talk to `tag:app-prod-provisioner-nodes` and vice versa.
- Users in `group:app-prod-provisioner-developers` can talk to `tag:app-prod-provisioner-api` and  `tag:app-prod-provisioner-nodes` 
- `tim.cook@glueops.dev` is part of `group:app-prod-provisioner-developers`
- `tim.cook@glueops.dev` can access their own instances tagged with `tag:tim-cook` however because we are using a SVC Admin account to tag the machines `tim.cook` doesn't actually own the tag itself.

The goals of this ACL policy are to allow the provisioner API to access "provisioner nodes" via SSH (port 2222 since tailscale SSH takes over port 22). `tim.cook` needs to be able to admistrate provisioner nodes so he is part of `group:app-prod-provisioner-developers` otherwise he can be kept out of this group. `tim.cook` also uses a workspace himself so he needs to have a tag himself. Any user that uses a developer workspace will need their own tag so that this slack workspace bot can assign machines to them (e.g.  `tag:tim-cook`).

When testing new policies/ACLs it's best to just create a separate tailnet/tailscale account for testing.

```json
{
    "acls": [
        {
            "action": "accept",
            "dst": [
                "tag:app-prod-provisioner-api:*",
                "tag:app-prod-provisioner-nodes:*"
            ],
            "src": [
                "group:app-prod-provisioner-developers"
            ]
        },
        {
            "action": "accept",
            "dst": [
                "tag:app-prod-provisioner-nodes:*"
            ],
            "src": [
                "tag:app-prod-provisioner-api"
            ]
        },
        {
            "action": "accept",
            "dst": [
                "tag:tim-cook:*"
            ],
            "src": [
                "tim.cook@glueops.dev"
            ]
        }
    ],
    "groups": {
        "group:app-prod-provisioner-developers": [
            "tim.cook@glueops.dev"
        ]
    },
    "ssh": [
        {
            "action": "check",
            "dst": [
                "autogroup:self"
            ],
            "src": [
                "autogroup:member"
            ],
            "users": [
                "autogroup:nonroot",
                "root"
            ]
        },
        {
            "action": "check",
            "dst": [
                "tag:tim-cook"
            ],
            "src": [
                "autogroup:member",
                "autogroup:admin"
            ],
            "users": [
                "autogroup:nonroot",
                "root"
            ]
        },
        {
            "action": "check",
            "dst": [
                "tag:app-prod-provisioner-api",
                "tag:app-prod-provisioner-nodes"
            ],
            "src": [
                "group:app-prod-provisioner-developers"
            ],
            "users": [
                "autogroup:nonroot",
                "root"
            ]
        }
    ],
    "tagOwners": {
        "tag:tim-cook": [
            "autogroup:admin"
        ],
        "tag:app-prod-provisioner-api": [
            "group:app-prod-provisioner-developers"
        ],
        "tag:app-prod-provisioner-nodes": [
            "group:app-prod-provisioner-developers"
        ]
    }
}
```

# Adding Bot commands
The bot is set up with a command handler to process text commands with a prefix of ! i.e. !vm. It currently does not support slash commands.
The bot has some built in example commands found in bot/src/commands. To register a new command, create a file command.js in either the bot/src/commands, or command-handler/src/commands with `myCommand.js` being the command you want to register. 
