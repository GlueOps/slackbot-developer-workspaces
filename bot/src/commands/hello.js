/*
    This is a simple command that replies with "Hey there <@user>!" after 5 seconds.
*/

//delay function to simulate a delay
const delay = (ms) => {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export default {
    description: 'Replies with Hello',

    run: async ({ response, event }) => {
        //call the delay function to simulate a delay of 5 seconds.
        await delay(5000);

        //send the response back to the slack channel After the delay
        response({
            text: `Hey there <@${event.user}>!`
        });
    }
}