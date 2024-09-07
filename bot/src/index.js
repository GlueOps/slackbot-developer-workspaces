import pkg from '@slack/bolt'
const { App, LogLevel } = pkg;
import CH from 'command-handler';
import path from 'path';
import 'dotenv/config';
import 'server';
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

const app = new App({
    token: process.env.BOT_TOKEN,
    signingSecret: process.env.SIGNING_SECRET,
    socketMode: true,
    appToken: process.env.APP_TOKEN,
    LogLevel: LogLevel.DEBUG,
    logger: customLogger,
});

(async () => {
    await app.start(process.env.BOLT_PORT || 3000);
    log.info('Bot is ready');

    new CH({
        app,
        featuresDir: path.join(process.cwd(), 'src', 'features'),
        commandsDir: path.join(process.cwd(), 'src', 'commands'),
    });
})();