/*
    This is a simple command that replies with pong
*/

export default {
    description: 'Replies with pong',

    run: ({ response }) => {

        response({
            text: `pong`
        })
    }
}