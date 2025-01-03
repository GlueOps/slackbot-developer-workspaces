/*
   Command Handler class 
*/

import cmdHandler from './cmd-handler/command-handler.js'; // import the command handler
import command from './events/legacy-command.js'; // import the command event
import button from './events/button-click.js'; // import the button click event

export default class CommandHandler {
    constructor({ app, commandsDir }) {
        // Check if app is provided
        if (!app) throw new Error('App is required');
        this._app = app; // app is the slack app
        this._commandHandler = null;
        // Create a command handler if commands directory is provided
        if (commandsDir) this._commandHandler = new cmdHandler(commandsDir, app, this);

        /*
        Create the command and button event Listeners
        pass the app and this instance of the command handler
        this calls the command and button functions to register the events
        */
        command(app, this);
        button(app, this);
    }
    
    // Getters for the private properties
    get commandHandler() {
        return this._commandHandler;
    }

    get app() {
        return this._app
    }
}