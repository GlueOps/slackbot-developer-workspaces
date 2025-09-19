/*
    This is the entry point for the Bolt app. It defines the express server that listens for incoming requests from Slack.
*/

import express from 'express';
import  logger from './util/logger.js';

// This function creates an express server that listens for incoming requests from Slack.
export default (receiver) => {
    const app = express();
    const log = logger();
    // The port on which the express server will listen for incoming requests.
    // The default port is 5000, but it can be overridden by setting the SERVER_PORT environment variable.
    const port = process.env.SERVER_PORT || 5000;

    // Attach the receiver's request listener to the express server.
    app.use('/', receiver.router);

    // Define a simple health check route that returns a 200 status code.
    app.get('/', (req, res) => {
        res.sendStatus(200);
    });

    // Start the express server.
    app.listen(port, () => {
        log.info(`The Bolt express server is listening on ${port}`)
    });
}
