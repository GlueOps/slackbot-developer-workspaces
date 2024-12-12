import pkg from '@slack/bolt'
const { App, ExpressReceiver, LogLevel } = pkg;
import CH from 'command-handler';
import path from 'path';
import 'dotenv/config';
import server from '../../server/server.js';
import logger from 'command-handler/src/util/logger.js';

const log = logger();

//custom logger for bolt app
const customLogger = {
    getLevel: () => log.level,
    debug: (message) => log.debug(message),
    info: (message) => log.info(message),
    warn: (message) => log.warn(message),
    error: (message) => log.error(message),
};

//receiver to integrate express with bolt
//The receiver is what allows Bolt to communicate with Slack's servers.
//The receiver listens for incoming HTTP requests from Slack, and then forwards them to the Bolt app.
const receiver = new ExpressReceiver({
    signingSecret: process.env.SIGNING_SECRET,
});

// Initialize Bolt app with custom logger and receiver
const app = new App({
    token: process.env.BOT_TOKEN,
    receiver,
    appToken: process.env.APP_TOKEN,
    LogLevel: LogLevel.DEBUG,
    logger: customLogger,
});

//function that starts the server and initializes the command handler
(async () => {
    server(receiver);
    new CH({
        //passing the bolt app to the command handler
        app,
        //directory where the commands are located
        commandsDir: path.join(process.cwd(), 'src', 'commands'),
    });
})();