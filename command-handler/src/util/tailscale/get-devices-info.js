import 'dotenv/config';
import axios from 'axios';
import logger from '../logger.js';
import axiosError from '../axios-error-handler.js';

const log = logger();

export default async function getDevices(serverName = null) {
  //get all the devices from tailscale
  const devices = await axios.get(`https://api.tailscale.com/api/v2/tailnet/${process.env.TAILSCALE_TAILNET_NAME}/devices`, {
      headers: {
        'Authorization': `Bearer ${process.env.TAILSCALE_API_TOKEN}`
      }
    })
    .catch(error => {
      log.error('Failed to get devices from tailscale', axiosError(error));
    });

    //loop through the devices and get a devideId, and deviceIp
    let deviceId = null, deviceIP = null;
        for (const device of devices.data.devices) {
          if (device.hostname === serverName) {
            deviceId = device.id;
            deviceIP = device.addresses[0]
          }
        }

    //return an object containing all the info
    return { devices, deviceId, deviceIP };
}