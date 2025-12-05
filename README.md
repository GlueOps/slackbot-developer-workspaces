# slackbot-developer-workspaces

This is the source code for a Slack bot. It is coded in Javascript using bolt.
The bot is set up to run in HTTP mode. The server is a heart-beat monitor 
and runs on port 5000 by default.

# Installation
### Dependencies
- Docker installed
- Slack App setup
- Tailscale Account and configured with auth token to add machines
- [Provisioner](https://github.com/GlueOps/provisioner) API Deployed to provision VMs on libvirt

### Steps
1. pull down the latest image from ghcr

2. You can then run the bot `docker run --env-file <path-to-.env-file -d -p 5000:5000 --name dev-bot <ghcr image>`
**If you change the server port, make sure to update that in the docker command**

3. refer to the example.env and steps to generate all the tokens required to set up the app below.

# Compile
If you would like to change the source code, or compile the slack Bot yourself:

1. Download the latest Slack Bot release

2. extract the zip folder. You can make modifications to the source code here.

3. Compile the bot code
`docker build -t <DOCKER_IMAGE_NAME> .`

4. You can then run the bot `docker run --env-file <path-to-.env-file -d -p 5000:5000 --name dev-bot <ghcr image>`
**If you change the server port, make sure to update that in the docker command**

5. refer to the example.env and steps to generate all the tokens required to set up the app below.

## Set up Slack App
1. You will need to create a [slack app](https://api.slack.com/apps)

2. In the app creation progress, create new app from a manifest and copy the [manifest.json](manifest.json) file in this repo.

3. Once you have created your Slack App, in the App credentials under Basic information,
you will find your signing secret.

4. Scroll down to App-Level-Tokens and generate a token with connections:write scope. This will be your app token

5. In the left bar settings menu, Select Install App. This will generate your bot token for you.

## Set up Tailscale

_Note: For the steps below use a service account that has Admin permissions._

1. Navigate to tailscale [admin console](https://login.tailscale.com/admin/machines)

2. In the top menu bar select Settings.

3. In the left menu bar select keys.

5. Generate an auth key: you will need to give it a description, and select Reusable. The key must be rotated and has a max expiration of 90 days, but can be shortened. Leave Ephemeral, and Tags unchecked and generate the key. This will be your tailscale auth key.

### Setup tailscale ACLs

Here is an example ACL that does the following:

- Machines with `tag:app-prod-provisioner-api` can talk to `tag:app-prod-provisioner-nodes` and vice versa.
- Users in `group:app-prod-provisioner-developers` can talk to `tag:app-prod-provisioner-api` and  `tag:app-prod-provisioner-nodes` 
- `tim.cook@glueops.dev` is part of `group:app-prod-provisioner-developers`
- `tim.cook@glueops.dev` can access their own instances tagged with `tag:tim-cook` however because we are using a SVC Admin account to tag the machines `tim.cook` doesn't actually own the tag itself.

The goals of this ACL policy are to allow the provisioner API to access "provisioner nodes" via SSH (port 2222 since tailscale SSH takes over port 22). `tim.cook` needs to be able to admistrate provisioner nodes so he is part of `group:app-prod-provisioner-developers` otherwise he can be kept out of this group. `tim.cook` also uses a workspace himself so he needs to have a tag himself. Any user that uses a developer workspace will need their own tag so that this slack workspace bot can assign machines to them (e.g.  `tag:tim-cook`).

When testing new policies/ACLs it's best to just create a separate tailnet/tailscale account for testing.

You can find an example ACL file in this [repo](tailscale-acls.json).

# Adding Bot commands
To register a new command, create a file `myCommand.js` in listeners/commands
with `myCommand.js` being the command you want to register. You then need to
add the /command in the [slack api](https://api.slack.com)
