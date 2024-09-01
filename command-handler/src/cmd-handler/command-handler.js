import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

import getFiles from '../util/get-files.js';

export default class CommandHandler {
    //<commandName, commandObject>
    _commands = new Map();

    constructor(commandsDir, app, handler) {
        if (!commandsDir) throw new Error('Commands directory is required');

        this.init(commandsDir, handler);
    }

    get commands() {
        return this._commands;
    }

    async init(commandsDir, handler) {
        const registeredCommands = [];
        const botCommands = getFiles(commandsDir);
        const currentFilePath = fileURLToPath(import.meta.url);
        const currentFileDir = path.dirname(currentFilePath);
        const builtInCommands = getFiles(path.join(currentFileDir, '..', 'commands'));
        const commands = [...botCommands, ...builtInCommands];

        for (const command of commands) {
            const commandName = path.basename(command, '.js').toLowerCase();
            const filePath = pathToFileURL(command);
            const commandObject = (await import(filePath)).default;

            if (!commandObject) {
                console.warn(`Command ${commandName} is empty`);
                continue;
            
            }
            
            const { 
                aliases = [],  
                delete: del,
                init = () => {},
            } = commandObject;

            if (del) {
                continue;
            }

            await init(handler)

            registeredCommands.push(commandName);
            this._commands.set(commandName, commandObject);
            
            for (const alias of aliases) {
                this._commands.set(alias, commandObject);
            }
        }
    }
}