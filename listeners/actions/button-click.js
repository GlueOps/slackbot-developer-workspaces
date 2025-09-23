/*
This file is responsible for handling button click events.
*/

import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import registeredButtons from './buttons.js';

export default function button(app) {

    // Register a single action handler for all actions
    app.action(/button_/, async ({ body, ack }) => {
    // Acknowledge the action so the app doesn't timeout
    await ack();

    // Extract the action ID from the event body
    const actionId = body.actions[0].action_id;

    let commandName = null;
    // Check for an exact match first
    if (registeredButtons[actionId]) {
        // set the command to handle the button to the matched button
        commandName = registeredButtons[actionId].command;
    } else {
        /*
        Iterate all of the registered buttons to check for a regex match
        destructuring the pattern and config from the registeredButtons object
        */
        for (const [pattern, config] of Object.entries(registeredButtons)) {
            /*
            check if the registered button is a regex pattern and 
            if the pattern matches the action ID
            */
            if (config.isRegex && new RegExp(pattern).test(actionId)) {
                // set the command to handle the button to the matched button
                commandName = config.command;
                // break out of the loop if a match is found
                break;
            }
        }
    }
    // Build the absolute path to the command file
    const currentFilePath = fileURLToPath(import.meta.url);
    const commandsDir = path.resolve(currentFilePath, '../../commands');
    const commandFilePath = path.join(commandsDir, `${commandName}.js`);
    const commandObject = (await import(pathToFileURL(commandFilePath))).default;
    //check if the command does not exist, or has no button handler, if so return.
    if (!commandObject || !commandObject.button) {
        await app.client.chat.postEphemeral({
            channel: `${body.channel.id}`,
            user: `${body.user.id}`,
            text: `No button handler is registered.`
        });
        return;
    }

    // run the command's button handler
    commandObject.button({ app, body, actionId });
    });
}
