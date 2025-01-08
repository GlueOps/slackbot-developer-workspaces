/*
This file is responsible for running the command
*/

export default async ({
    commandName, // the name of the command
    handler, // the command handler
    app, // the slack app
    event, // the event object
    args, // the command arguments
    say // the say function to send a message
}) => {
    // destructure the commands and command handler from the handler
    const { commandHandler } = handler;
    const { commands } = commandHandler;

    //retrieve the command object from the commands map
    const command = commands.get(commandName);

    //check if the command does not exist, or has no run function, if so return.
    if (!command || !command.run) {
        return
    }

    // retrieve the text from the arguments joined by a space
    const text = args.join(' ');

    //create a response function to send a message
    const response = (obj) => {
        say(obj)
    };

    // run the command's run function
    command.run({ handler, app, event, response, text, args });
};