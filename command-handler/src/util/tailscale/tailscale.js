import 'dotenv/config'
import axios from 'axios'

export default {
    removeDevice: async ({ deviceId }) => {
        await axios.delete(`https://api.tailscale.com/api/v2/device/${deviceId}`, {
            headers: {
              'Authorization': `Bearer ${process.env.TAILSCALE_API_TOKEN}`
            }
        });
    }
}
