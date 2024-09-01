export default async ({
    commandName,
    handler,
    body,
    say,
}) => {
    const { commandHandler } = handler;
    const { commands } = commandHandler;

    const command = commands.get(commandName);

    const response = (obj) => {
        say(obj)
    };

    if (!command || !command.button) {
        response({
            text: `No button handler is registered.`
        })
        return
    }

    command.button({ handler, body, response });
};