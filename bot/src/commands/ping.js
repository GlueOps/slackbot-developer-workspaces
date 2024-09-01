export default {
    description: 'Replies with pong',

    run: ({ response }) => {

        response({
            content: `pong`
        })
    }
}