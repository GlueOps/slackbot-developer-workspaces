import 'dotenv/config'
import axios from 'axios'

export default {
    setTags: async ({ userEmail, deviceId }) => {
        await axios.post(`https://api.tailscale.com/api/v2/device/${deviceId}/tags`, 
            {
            "tags": [
                `tag:${userEmail}`
            ]
            }, {
            headers: {
            'Authorization': `Bearer ${process.env.TAILSCALE_API_TOKEN}`,
            'Content-Type': 'application/json'
            }
        });
    },

    removeDevice: async ({ deviceId }) => {
        await axios.delete(`https://api.tailscale.com/api/v2/device/${deviceId}`, {
            headers: {
              'Authorization': `Bearer ${process.env.TAILSCALE_API_TOKEN}`
            }
        });
    }
}