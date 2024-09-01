export default {
    description: 'creates a button',

    button: ({ handler, body, response }) => {
        console.log(body);
        console.log(handler);
        response({
            text: `<@${body.user.id}> clicked the Button`
        })
    },
    
    run: ({ response, message }) => {

        response({
            blocks: [
                {
                  "type": "section",
                  "text": {
                    "type": "mrkdwn",
                    "text": `Hey there <@${message.user}>!`
                  },
                  "accessory": {
                    "type": "button",
                    "text": {
                      "type": "plain_text",
                      "text": "Click Me"
                    },
                    "action_id": "button_click"
                  }
                }
              ],
              text: `Hey there <@${message.user}>!`
        })
    }
}