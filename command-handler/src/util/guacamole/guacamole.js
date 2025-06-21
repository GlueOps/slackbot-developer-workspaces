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

        const connectionsMap = new Map(Object.values(connections.data).map(conn => [conn.name, conn]));
        const updatedServers = servers.map(server => {
            const matchingConnection = connectionsMap.get(server.serverName);

            if (matchingConnection) {
                const connectionId = matchingConnection.identifier;
                const rawIdentifier = `${connectionId}\0${connectionType}\0${dataSource}`;
                const urlSafeId = Buffer.from(rawIdentifier, 'utf-8').toString('base64url');
                const cleanBaseUrl = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
                const fullUrl = `${cleanBaseUrl}#/client/${urlSafeId}`;

                return { ...server, connect: fullUrl };
            }
            
            return server; 
        });

        return updatedServers;
    }
}
