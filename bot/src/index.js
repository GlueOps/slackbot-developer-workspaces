import pkg from '@slack/bolt'
const { App, LogLevel } = pkg;
import CH from 'command-handler';
import path from 'path';
import 'dotenv/config';
import 'server';

const app = new App({
    token: process.env.BOT_TOKEN,
    signingSecret: process.env.SIGNING_SECRET,
    socketMode: true,
    appToken: process.env.APP_TOKEN,
    logLevel: LogLevel.TRACE,
});

(async () => {
    await app.start(process.env.BOLT_PORT || 3000);
    console.log('Bot is ready');

    new CH({
        app,
        featuresDir: path.join(process.cwd(), 'src', 'features'),
        commandsDir: path.join(process.cwd(), 'src', 'commands'),
    });
})();