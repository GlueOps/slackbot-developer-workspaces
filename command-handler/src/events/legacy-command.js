import runCommand from '../cmd-handler/run-command.js';

export default function command(app, handler) {
    const prefix = '!'
    app.message(async ({ message, say }) => {
        const content = message.text;
        if (!content.startsWith(prefix)) return;

        const args = content.slice(prefix.length).trim().split(/ +/g);
        if (args.length === 0) return;
        
        const commandName = args.shift().toLowerCase();

        runCommand({
            commandName,
            handler,
            app,
            message,
            say,
            args
        })
    })
}