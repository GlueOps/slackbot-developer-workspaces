/*
    This is a sample command that creates a button in the slack message.
    The button click event is handled by the button method.

*/

import logger from "../../util/logger.js";

//initialize logger
const log = logger();

export default {
    description: 'creates a button',

    //button click event handler This is called when the button is clicked
    button: ({ app, body }) => {
        log.info("Clicked the button", body.user)
        app.client.chat.postMessage({
            channel: body.channel.id,
            text: `Button clicked by <@${body.user.id}>`
        })
    },
    
    /*
    run method is called when the command is executed
    To execute this command type !button in the slack channel where the bot is installed
    The parameters are destructured from the object passed to the run method
    event is the event object that contains the event details from slack.
    */
    run: ({ event, app }) => {
        app.client.chat.postMessage({
            channel: event.channel_id,
            blocks: [
                {
                  "type": "section",
                  "text": {
                    "type": "mrkdwn",
                    "text": `Hey there <@${event.user_name}>!`
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
              //text is fallback text that is displayed when the message is not supported
              text: `Hey there <@${event.user_name}>!`
        })
    }
}
