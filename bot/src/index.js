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
const receiver = new ExpressReceiver({
    signingSecret: process.env.SIGNING_SECRET,
});

const app = new App({
    token: process.env.BOT_TOKEN,
    receiver,
    appToken: process.env.APP_TOKEN,
    LogLevel: LogLevel.DEBUG,
    logger: customLogger,
});

(async () => {
    server(receiver);
    new CH({
        app,
        featuresDir: path.join(process.cwd(), 'src', 'features'),
        commandsDir: path.join(process.cwd(), 'src', 'commands'),
    });
})();