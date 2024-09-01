import axios from 'axios';
import 'dotenv/config';

export default {
    description: 'Sets up vm options',

    run: async ({ response }) => {

        const data = await axios.get('https://api.hetzner.cloud/v1/servers', {
            headers: {
              'Authorization': `Bearer ${process.env.HETZNER_API_TOKEN}`
            }
          })
          .catch(error => {
            console.error('Error:', error);
          });

          console.log(data.data);

        response({
            text: `${JSON.stringify(data.data)}`
        })
    }
}