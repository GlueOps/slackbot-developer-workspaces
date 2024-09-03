import 'dotenv/config';
import axios from 'axios';

export default async function getServer() {
    const data = await axios.get('https://api.hetzner.cloud/v1/servers', {
        headers: {
          'Authorization': `Bearer ${process.env.HETZNER_API_TOKEN}`
        }
      })
      .catch(error => {
        console.error('Error:', error);
      });

      return data;
}