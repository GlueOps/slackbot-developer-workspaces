import cmdHandler from './cmd-handler/command-handler.js';
import command from './events/legacy-command.js';

export default class CommandHandler {
    constructor({ app, commandsDir }) {
        if (!app) throw new Error('App is required');
        this._app = app;
        if (commandsDir) this._commandHandler = new cmdHandler(commandsDir, app, this);

        command(app, this);
    }
    
    get commandHandler() {
        return this._commandHandler;
    }

    get app() {
        return this._app
    }
}