const delay = (ms) => {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export default {
    description: 'Replies with Hello',

    run: async ({ response, event }) => {
        await delay(5000);

        response({
            text: `Hey there <@${event.user}>!`
        })
    }
}