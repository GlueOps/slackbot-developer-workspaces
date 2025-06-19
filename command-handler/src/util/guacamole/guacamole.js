import 'dotenv/config'
import axios from 'axios'

export default {
    getConnections: async (servers = []) => {
        const connectionType = 'c';
        const baseUrl = process.env.GUACAMOLE_SERVER_URL;

        let tokenResponse;
        try {
            const params = new URLSearchParams();
            params.append('username', process.env.GUACAMOLE_SERVER_USERNAME);
            params.append('password', process.env.GUACAMOLE_SERVER_PASSWORD);
    
            tokenResponse = await axios.post(`${baseUrl}/api/tokens`, 
                params, {
                headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
                }
            });
        } catch (error) {
            console.error("Error fetching token:", error.message);
            return [];
        }

        const dataSource = tokenResponse.data.dataSource;
        const token = tokenResponse.data.authToken;

        let connections;
        try {
            connections = await axios.get(`${baseUrl}/api/session/data/${dataSource}/connections`, {
                headers: {
                    "guacamole-token": `${token}`
                }
            });
        } catch (error) {
            console.error("Error fetching connections:", error.message);
            return [];
        }

        for (const server of servers) {
            let connectionId = null;
            let fullUrl = null;
            for (const connection of Object.values(connections.data)) {
                if (connection.name === server.serverName) {
                    connectionId = connection.identifier;
                }
            }
            const rawIdentifier = `${connectionId}\0${connectionType}\0${dataSource}`;
            const encodedString = Buffer.from(rawIdentifier, 'utf-8').toString('base64');
            const urlSafeId = encodedString
                .replace(/\+/g, '-')
                .replace(/\//g, '_')
                .replace(/=+$/, '');
            if (!baseUrl.endsWith('/')) {
                fullUrl = `${baseUrl}/#/client/${urlSafeId}`;
            } else {
                fullUrl = `${baseUrl}#/client/${urlSafeId}`;
            }

            server.connect = fullUrl;
        }
        console.log(servers)
        return servers;
    }
}
