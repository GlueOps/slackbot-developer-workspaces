/*
    This is a sample command that creates a button in the slack message.
    The button click event is handled by the button method.

*/

import logger from "command-handler/src/util/logger.js";

//initialize logger
const log = logger();

export default {
    description: 'creates a button',

    //button click event handler This is called when the button is clicked
    button: ({ handler, body, response }) => {
        log.info("Clicked the button", body.user)
        response({
            text: `<@${body.user.id}> clicked the Button`
        })
    },
    
    //run method is called when the command is executed
    //To execute this command type !button in the slack channel where the bot is installed
    //The paramaters are descructured from the object passed to the run method
    //response is used to send the response back to the slack channel
    //event is the event object that contains the event details from slack.
    run: ({ response, event }) => {

        response({
          //blocks is used to create a button in the slack message
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
              //text is fallback text that is displayed when the message is not supported
              text: `Hey there <@${event.user}>!`
        })
    }
}