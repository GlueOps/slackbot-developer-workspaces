import 'dotenv/config';
import axios from 'axios';
import axiosError from './axios-error-handler.js';
import logger from './logger.js';

const log = logger();

export default async function getServer(serverId = "") {
    const data = await axios.get(`https://api.hetzner.cloud/v1/servers/${serverId}`, {
        headers: {
          'Authorization': `Bearer ${process.env.HETZNER_API_TOKEN}`
        }
      })
      .catch(error => {
        log.error('Failed to get servers from hetzner', axiosError(error));
      });

      return data;
}