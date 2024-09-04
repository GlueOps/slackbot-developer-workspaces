export default {
    description: 'Replies with pong',

    run: ({ response }) => {

        response({
            text: `pong`
        })
    }
}