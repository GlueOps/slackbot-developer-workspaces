export default async ({
    commandName,
    handler,
    app,
    event,
    args,
    say
}) => {
    const { commandHandler } = handler;
    const { commands } = commandHandler;

    const command = commands.get(commandName);

    if (!command || !command.run) {
        return
    }

    const text = args.join(' ');

    const response = (obj) => {
        say(obj)
    };

    command.run({ handler, app, event, response, text, args });
};