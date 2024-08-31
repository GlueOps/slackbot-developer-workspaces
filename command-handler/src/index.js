import cmdHandler from './cmd-handler/command-handler.js';

export default class CommandHandler {
    constructor({ commandsDir }) {
        if (commandsDir) this._commandHandler = new cmdHandler(commandsDir, this);
    }
    
    get commandHandler() {
        return this._commandHandler;
    }
}