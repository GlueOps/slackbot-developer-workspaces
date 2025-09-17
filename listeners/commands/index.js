import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import logger from '../../util/logger.js';
import getFiles from '../../util/get-files.js';

export default async function register(app) {
    const log = logger();

    const currentFilePath = fileURLToPath(import.meta.url);
    const currentFileDir = path.dirname(currentFilePath);

    const commands = getFiles(path.join(currentFileDir));

    //loop through all the commands
    for (const command of commands) {
        //get the command name and file path
        const commandName = path.basename(command, '.js').toLowerCase();
        const filePath = pathToFileURL(command);
        //do not register this file as a command
        if (commandName === 'index') continue;
        //import the command object
        const commandObject = (await import(filePath)).default;

        //warn if the command is empty and continue to the next command
        if (!commandObject) {
            log.warn(`Command ${commandName} is empty`);
            continue;
        }

        //register the command
        app.command(`/${commandName}`, async ({ command, ack, body }) => {
            await ack();
            await commandObject.run({ event: command, app, body });
        });
    }
}
