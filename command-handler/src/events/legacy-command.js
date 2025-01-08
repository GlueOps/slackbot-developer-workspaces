/*
    This file is responsible for handling legacy commands.
    These commands are sent as messages and start with a prefix.
*/

import runCommand from '../cmd-handler/run-command.js';

export default function command(app, handler) {
    // Set the prefix for the commands
    const prefix = '!';
    /*
    Register a single event handler for all messages
    This event handler will listen for messages that 
    start with the prefix
    */
    app.event('message', async ({ event, say }) => {
        // get the content of the message
        const content = event.text;
        /*
        if the content does not start with the prefix, 
        return as this is not a command
        */
        if (!content.startsWith(prefix)) return;

        /*
        create an array of arguments by splitting 
        the content by spaces and removing the prefix
        */
        const args = content.slice(prefix.length).trim().split(/ +/g);
        // if there are no arguments, return. 
        // i.e. the message is just the prefix
        if (args.length === 0) return;
        
        /*
        get the command name which is the first argument
        in the args array, and convert it to lowercase
        for case-insensitive matching
        */
        const commandName = args.shift().toLowerCase();

        // call the runCommand function to run the command
        runCommand({
            commandName,
            handler,
            app,
            event,
            say,
            args
        })
    });
}