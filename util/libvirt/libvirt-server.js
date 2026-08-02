import logger from '../logger.js';
import 'dotenv/config';
import axios from 'axios';
import configUserData, { TUNNEL_ENDPOINT_PATTERN } from "../get-user-data.js";
import axiosError from '../axios-error-handler.js';
import { uniqueNamesGenerator, colors, animals } from 'unique-names-generator';
import { generateCdeToken } from '../token-generator.js';
import { randomBytes } from 'crypto';

const log = logger();

// The provisioner's 4xx responses carry an actionable `detail` string (e.g.
// region at capacity, VM not found). Surface it so users can self-serve
// instead of guessing. 5xx bodies always carry a generic boilerplate detail
// and FastAPI validation errors are arrays — both return an empty string.
const provisionerDetail = (error) => {
    const status = error?.response?.status;
    const detail = error?.response?.data?.detail;
    return typeof detail === 'string' && detail && status >= 400 && status < 500
        ? `\nReason: ${detail}`
        : '';
};

// Legacy central sish endpoint. Every VM created before regional tunnels
// existed connects here, so it is the fallback whenever a region doesn't
// declare its own tunnel_endpoint (or the lookup fails outright).
export const DEFAULT_TUNNEL_ENDPOINT = 'tunnels.glueopshosted.com';

// Access URL for a CDE VM. The legacy central sish appends the SSH username
// to a "cde" bind (cde-<name>.tunnels...); regional instances let the VM
// bind its bare hostname (<name>.<region>.tunnels.cde...). The VM-side rule
// in the codespaces image's developer-setup.sh derives the bind from the
// same endpoint value, so URL and tunnel can never disagree.
export const cdeAccessUrl = (serverName, tunnelEndpoint, cdeToken) => {
    const host = tunnelEndpoint === DEFAULT_TUNNEL_ENDPOINT
        ? `cde-${serverName}.${tunnelEndpoint}`
        : `${serverName}.${tunnelEndpoint}`;
    return `https://${host}?folder=/workspaces/glueops&tkn=${cdeToken}`;
};

// Resolve the sish endpoint for a region from the provisioner's region
// config. Never throws: creation must not fail (or silently go central-only
// with a regional URL) because of a transient /v1/regions error. A value that
// fails the hostname pattern is rejected here, before it fans out to the
// permanent tag, the access URLs, and cloud-init — those consumers must all
// agree on one endpoint, and cloud-init would silently drop a non-hostname.
const getTunnelEndpoint = async (region) => {
    try {
        const res = await axios.get(`${process.env.PROVISIONER_URL}/v1/regions`, {
            headers: { 'Authorization': `${process.env.PROVISIONER_API_TOKEN}` },
            timeout: 1000 * 30
        });
        // Normalize case and any trailing dot: DNS treats them as equivalent,
        // but the legacy-vs-regional split in cdeAccessUrl and on the VM is an
        // exact string comparison against DEFAULT_TUNNEL_ENDPOINT.
        const endpoint = res.data?.find(r => r.region_name === region)
            ?.tunnel_endpoint?.trim().toLowerCase().replace(/\.$/, '');
        if (!endpoint) return DEFAULT_TUNNEL_ENDPOINT;
        if (!TUNNEL_ENDPOINT_PATTERN.test(endpoint)) {
            log.error(`Region ${region} has invalid tunnel_endpoint "${endpoint}", using default`);
            return DEFAULT_TUNNEL_ENDPOINT;
        }
        return endpoint;
    } catch (error) {
        log.error('Failed to resolve tunnel endpoint, using default', axiosError(error));
        return DEFAULT_TUNNEL_ENDPOINT;
    }
};

// Parse a codespaces release tag into its numeric core and optional
// prerelease suffix. Accepts the repo's real tag shapes: vX.Y.Z and
// prereleases like vX.Y.Z-RC1 (nonprod's image picker serves those). The
// strict shape check matters: Number('') is 0, not NaN, so a typo like "v"
// would otherwise parse as [0] and open the gate for every old image.
const parseImageTag = (tag) => {
    const m = /^v?(\d+(?:\.\d+)*)(?:-([0-9a-z.-]+))?$/i.exec(String(tag).trim());
    if (!m) return null;
    return { core: m[1].split('.').map(Number), pre: m[2]?.toLowerCase() ?? null };
};

const compareImageTags = (a, b) => {
    for (let i = 0; i < Math.max(a.core.length, b.core.length); i++) {
        const d = (a.core[i] || 0) - (b.core[i] || 0);
        if (d) return d;
    }
    // Equal numeric cores: a stable release outranks its own prereleases (an
    // RC may predate fixes in the stable cut); prereleases compare naturally
    // so RC2 < RC10.
    if (!a.pre && !b.pre) return 0;
    if (!a.pre) return 1;
    if (!b.pre) return -1;
    return a.pre.localeCompare(b.pre, undefined, { numeric: true });
};

// Images older than REGIONAL_TUNNEL_MIN_IMAGE_TAG bake a dev() that ignores
// /etc/glueops/tunnel_endpoint and always tunnels to the legacy central
// endpoint, so giving such a VM a regional endpoint would advertise dead
// access URLs. Unset means regional tunnels stay off entirely; unparseable
// tags fail safe to legacy but are logged loudly, because a set-but-broken
// gate must not be indistinguishable from the feature being off.
const imageSupportsRegionalTunnel = (imageName) => {
    const min = process.env.REGIONAL_TUNNEL_MIN_IMAGE_TAG;
    if (!min) return false;
    const floor = parseImageTag(min);
    if (!floor) {
        log.error(`REGIONAL_TUNNEL_MIN_IMAGE_TAG "${min}" is not a parseable release tag; regional tunnels stay OFF`);
        return false;
    }
    const image = parseImageTag(imageName);
    if (!image) {
        log.error(`Image tag "${imageName}" is not a parseable release tag; VM falls back to the legacy tunnel endpoint`);
        return false;
    }
    return compareImageTags(image, floor) >= 0;
};

export default {
    createServer: async({ client, body, imageName, region, instanceType, description, channel_id, singleClickExperience, userEnv = {}, cloneRepo = null, profileName = null, batch = false }) => {
        //auto generate the name
        const serverName = uniqueNamesGenerator({
            dictionaries: [ colors, animals ],
            separator: '-'
        }) + '-' + randomBytes(3).toString('hex');

        // Generate CDE token if Single-Click Experience is enabled
        const cdeToken = singleClickExperience ? generateCdeToken() : null;

        // The sish tunnel only runs on CDE-enabled VMs, so only resolve the
        // endpoint for those, and only when the chosen image can actually read
        // it — otherwise the VM gets the legacy endpoint so its tag and URLs
        // match where the tunnel really connects. Recorded in tags below as
        // the permanent truth (the region config may change later).
        let tunnelEndpoint = null;
        if (cdeToken) {
            tunnelEndpoint = imageSupportsRegionalTunnel(imageName)
                ? await getTunnelEndpoint(region)
                : DEFAULT_TUNNEL_ENDPOINT;
        }

        // Call the users.info method using the WebClient
        let info;
        try {
            info = await client.users.info({
            user: body.user.id
            });
        } catch (error) {
            log.error('There was an error calling the user.info method in slack', error);

            if (!batch) {
                await client.chat.postEphemeral({
                channel: channel_id,
                user: body.user.id,
                text: `Failed to get user info from slack`
                });
            }

            return { success: false, serverName, description: description || 'No description' };
        }

        const userEmail = info.user.profile.email;
        const descriptionText = description || 'No description';

        //post a status message (suppressed in batch — the batch summary is the single source of truth)
        if (!batch) {
            await client.chat.postEphemeral({
                channel: channel_id,
                user: body.user.id,
                text: `Creating the server: ${serverName} with image: ${imageName}\nDescription: ${descriptionText}`
            });
        }

        // Build tags object, including CDE token if enabled
        const tags = {
            "owner": userEmail,
            "description": description || '',
            "created_at": new Date().toISOString(),
            ...(cdeToken && { "cde_token": cdeToken }),
            ...(tunnelEndpoint && { "tunnel_endpoint": tunnelEndpoint }),
            ...(cloneRepo && { "clone_repo": cloneRepo })
        };

        let serverRes;
        try {
            serverRes = await axios.post(`${process.env.PROVISIONER_URL}/v1/create`, 
                {
                    "vm_name": serverName,
                    "tags": tags,
                    "user_data": Buffer.from(configUserData(serverName, cdeToken, {
                        SERVER_NAME: serverName,
                        REGION: region,
                        INSTANCE_TYPE: instanceType,
                        IMAGE: imageName,
                        OWNER: userEmail,
                        CREATED_AT: tags.created_at,
                        ...(tunnelEndpoint && { TUNNEL_ENDPOINT: tunnelEndpoint }),
                        // Platform-namespaced clone hint; consumed by the codespaces
                        // image's developer-setup.sh at boot (per-create, not persisted).
                        // The default branch is always used.
                        ...(cloneRepo && { CLONE_REPO: cloneRepo })
                    }, userEnv)).toString('base64'),
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

            if (!batch) {
                await client.chat.postEphemeral({
                channel: channel_id,
                user: body.user.id,
                text: `Failed to create server: ${serverName}\nDescription: ${descriptionText}${provisionerDetail(error)}`
                });
            }

            return { success: false, serverName, description: descriptionText };
        }

        //return info for connection
        let accessUrl, accessLabel;
        if (cdeToken) {
            accessUrl = cdeAccessUrl(serverName, tunnelEndpoint, cdeToken);
            accessLabel = 'Cloud Development Environment';
        } else {
            accessUrl = process.env.GUACAMOLE_CONNECTION_URL;
            accessLabel = 'Guacamole';
        }

        let responseText = `Server: ${serverName}\nDescription: ${descriptionText}\nStatus: Created\nRegion: ${region}`;
        if (profileName) {
            responseText += `\nProfile: ${profileName}`;
        }
        responseText += `\nRepo: ${cloneRepo || 'None'}`;
        responseText += `\nAccess: <${accessUrl}|${accessLabel}>`;
        responseText += `\n\n_Note: It may take up to 60 seconds for the server to be accessible as it has just been created._`;

        if (!batch) {
            await client.chat.postEphemeral({
                channel: channel_id,
                user: body.user.id,
                text: responseText
            });
        }

        return { success: true, serverName, description: descriptionText, accessUrl, accessLabel, cloneRepo };
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
              text: `Failed to delete Server: ${serverName}.${provisionerDetail(error)}`
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
              text: `Failed to start Server: ${serverName}.${provisionerDetail(error)}`
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
              text: `Failed to stop Server: ${serverName}.${provisionerDetail(error)}`
            });
        } 
    },

    editServer: async({ client, body, serverName, region, channel_id, tags }) => {
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
  
            client.chat.postEphemeral({
              channel: channel_id,
              user: user_id,
              text: `Server: ${serverName} has been Edited.`
            });
        } catch (error) {
            log.error('Failed to edit the server description', axiosError(error));
  
            client.chat.postEphemeral({
              channel: channel_id,
              user: user_id,
              text: `Failed to edit Server: ${serverName}.${provisionerDetail(error)}`
            });
        } 
    }
};
