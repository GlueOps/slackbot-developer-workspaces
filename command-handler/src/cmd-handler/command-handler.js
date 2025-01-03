/*
    This file is responsible for handling commands. 
    It reads all the commands from the commands directory and stores them in a map.
*/

import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import logger from '../util/logger.js';
import getFiles from '../util/get-files.js';

const log = logger();

export default class CommandHandler {
    //<commandName, commandObject>
    _commands = new Map();

    constructor(commandsDir, handler) {
        //throw error if commands directory is not provided
        if (!commandsDir) throw new Error('Commands directory is required');

        //initialize the command handler
        //this function is called because the constructor cannot be async
        this.init(commandsDir, handler);
    }

    //getter for commands
    get commands() {
        return this._commands;
    }

    async init(commandsDir, handler) {
        const registeredCommands = [];
        //get all the files in the commands directory
        const botCommands = getFiles(commandsDir);
        //get the current file path and directory
        const currentFilePath = fileURLToPath(import.meta.url);
        const currentFileDir = path.dirname(currentFilePath);
        //get all the files in the built-in commands directory
        const builtInCommands = getFiles(path.join(currentFileDir, '..', 'commands'));
        //combine the bot commands and built-in commands
        const commands = [...botCommands, ...builtInCommands];

        //loop through all the commands
        for (const command of commands) {
            //get the command name and file path
            const commandName = path.basename(command, '.js').toLowerCase();
            const filePath = pathToFileURL(command);
            //import the command object
            const commandObject = (await import(filePath)).default;

            //warn if the command is empty and continue to the next command
            if (!commandObject) {
                log.warn(`Command ${commandName} is empty`);
                continue;
            }
            
            //destructure the command object properties
            const { 
                aliases = [],  
                delete: del,
                init = () => {},
            } = commandObject;

            /*
            if del (delete) is true, continue to the next command
            skipping the command registration process. This does
            not delete the command file from the app, simply does
            not register the command with the command handler
            */
            if (del) {
                continue;
            }

            /*
            call the init function that was destructured 
            from the command object. Since the init function
            is async, we await the function to complete before
            continuing. This function is an optional function
            that commands can use to run any initialization code
            that the command depends on before being registered.
            */
            await init(handler)

            /*
            set the command name and object in the commands map
            and add the command name to the registered commands array
            so the app is aware of the commands that are registered
            */
            registeredCommands.push(commandName);
            this._commands.set(commandName, commandObject);
            
            /*
            loop through the aliases and set the alias and command object
            so commands can be called by their aliases in addition to their
            command name. This allows for more flexibility when calling commands
            */
            for (const alias of aliases) {
                this._commands.set(alias, commandObject);
            }
        }
    }
}