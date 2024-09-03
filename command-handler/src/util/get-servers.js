import 'dotenv/config';
import axios from 'axios';
import log from './logger.js';

export default async function getServer() {
    const data = await axios.get('https://api.hetzner.cloud/v1/servers', {
        headers: {
          'Authorization': `Bearer ${process.env.HETZNER_API_TOKEN}`
        }
      })
      .catch(error => {
        log.error('Failed to get servers from hetzner', error);
      });

      return data;
}