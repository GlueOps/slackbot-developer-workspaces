/*
    This is a simple command that replies with pong
*/

export default {
    description: 'Replies with pong',

    run: ({ event, app }) => {
        app.client.chat.postEphemeral({
            channel: event.channel_id,
            user: event.user_id,
            text: `pong`
        });
    }
}
