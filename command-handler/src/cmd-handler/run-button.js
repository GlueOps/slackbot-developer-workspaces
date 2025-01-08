/*
    This file is responsible for running the button
    That is associated with a command
*/

export default async ({
    commandName, // the name of the command
    actionId, // the action ID of the button
    handler, // the command handler
    app, // the slack app
    body, // the body of the event
    say, // the say function to send a message
}) => {
    // destructure the commands and command handler from the handler
    const { commandHandler } = handler;
    const { commands } = commandHandler;

    //retrieve the command object from the commands map
    const command = commands.get(commandName);

    //create a response function to send a message
    const response = (obj) => {
        say(obj)
    };

    //check if the command does not exist, or has no button handler, if so return.
    if (!command || !command.button) {
        response({
            text: `No button handler is registered.`
        })
        return
    }

    // run the command's button handler
    command.button({ handler, app, body, response, actionId });
};