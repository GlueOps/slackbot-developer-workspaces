import logger from "command-handler/src/util/logger.js";

const log = logger();

export default {
    description: 'creates a button',

    button: ({ handler, body, response }) => {
        log.info("Clicked the button", body.user)
        response({
            text: `<@${body.user.id}> clicked the Button`
        })
    },
    
    run: ({ response, event }) => {

        response({
            blocks: [
                {
                  "type": "section",
                  "text": {
                    "type": "mrkdwn",
                    "text": `Hey there <@${event.user}>!`
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
              text: `Hey there <@${event.user}>!`
        })
    }
}