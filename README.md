# slackbot-developer-workspaces

This is the source code for a Slack bot. It is coded in Javascript using bolt.
It has three components: bot, command-handler, and server. The bot is set up
to run in socket mode. The server is a heart-beat monitor and runs on port 5000,
while the bolt server listens on port 3000 by default. Read more in 

# Installation
### Dependencies
- Docker installed
- Slack App setup
- Hetzner Account and configured with API Token in the cloud projects
- Tailscale Account and configured with API Token to install, add, remove machines

### Steps
1. pull down the latest image from ghcr

2. You can then run the bot `docker run --env-file <path-to-.env-file -d -p 5000:5000 -p 3000:3000 --name slack-bot <ghcr image>`
**If you change the bolt port or the server port, make sure to update that in the docker command**

3. You can find an example.env file in bot/example.env. Steps to generate all the tokens required and set up the bot are below.

# Compile
If you would like to change the source code, or compile the slack Bot yourself:

1. Download the latest Slack Bot release

2. extract the zip folder. You can make modifications to the source code here.

3. Compile the bot code
`docker build -t <DOCKER_IMAGE_NAME> .`

4. You can then run the bot `docker run --env-file <path-to-.env-file -d -p 5000:5000 -p 3000:3000 --name slack-bot <ghcr image>`
**If you change the bolt port or the server port, make sure to update that in the docker command**

5. You can find an example.env file in bot/example.env. Steps to generate all the tokens required and set up the bot are below.

## Set up Slack App
1. You will need to creat a [slack app](https://api.slack.com/apps)

2. Once you have created your Slack App, in the App credentials under Basic information,
you will find your signing secret.

3. Scroll down to App-Level-Tokens and generate a token with connections:write scope. This will be your app token

4. In the left bar settings menu, select Socket Mode. You will need to enable this for the app to run in socket mode.

5. In the left bar settings menu, Select Install App. This will generate your bot token for you.

6. In the left bar settings menu, Select OAuth & Permissions. You will need to scroll down to Scopes and give access to the following Scopes
   - channels:history
   - chat:write
   - groups:history
   - im:history
   - mpim:history
   - users:read
   - users:read.email

7. In the left bar settings menu, Select Event Subscriptions. Enable events, and under Subscribe to bot events add the following Bot User Events:
    - message.channels
    - message.groups
    - message.im
    - message.mpim

## Set up Hetzner
1. Navigate to hetzner [cloud](https://console.hetzner.cloud/projects)

2. Create a project.

3. Once in the project, select security from the left menu bar options.

4. Select API tokens and generate an API Token with Read & Write permissions. This will be your hetzner api token.

## Set up Tailscale
1. Navigate to tailscale [admin console](https://login.tailscale.com/admin/machines)

2. In the top menu bar, click DNS. This will give you your Tailnet name.

3. In the top menu bar select Settings.

4. In the left menu bar select keys.

5. Generate an auth key: you will need to give it a description, and select Reusable. The key must be rotated and has a max expiration of 90 days, but can be shortened. Leave Ephemeral, and Tags unchecked and generate the key. This will be your tailscale auth key.

6. Generate an API acess token: you will need to give it a description. The key must be rotated and has a max expiration of 90 days, but can be shortened. This will be your Tailscale api token.

# Adding Bot commands
The bot is set up with a command handler to process text commands with a prefix of ! i.e. !vm. It currently does not support slash commands.
The bot has some built in example commands found in bot/src/commands. To register a new command, create a file command.js in either the bot/src/commands, or command-handler/src/commands with `myCommand.js` being the command you want to register. 