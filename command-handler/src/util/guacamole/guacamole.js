import 'dotenv/config'
import axios from 'axios'

export default {
    getConnections: async (servers = []) => {
        const connectionType = 'c';
        const baseUrl = process.env.GUACAMOLE_SERVER_URL;

        let tokenResponse;
        try {
            tokenResponse = await axios.post(`${baseUrl}/api/tokens`, 
                {
                "username": process.env.GUACAMOLE_SERVER_USERNAME,
                "password": process.env.GUACAMOLE_SERVER_PASSWORD
                }, {
                headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
                }
            });
        } catch (error) {
            console.error("Error retrieving token:", error.message);
            throw new Error("Failed to retrieve token from Guacamole server.");
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
            console.error("Error retrieving connections:", error.message);
            throw new Error("Failed to retrieve connections from Guacamole server.");
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
        return servers;
    }
}
