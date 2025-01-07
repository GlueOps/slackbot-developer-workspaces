/*
    This file is used to build a button block for a Slack message.
    This is primarily used in the vm command to programmatically 
    build the buttons that are used for the vm commands.
*/

export default function buttonBuilder({ buttonsArray, headerText, fallbackText }) {
    /*
    Map the buttonsArray to the format that Slack expects by
    looping through the buttonsArray and create a new object for each button.
    */
    let buttonBlocks = buttonsArray.map(button => {
        return {
            "type": "button",
            "text": {
                "type": "plain_text",
                "text": button.text
            },
            "action_id": button.actionId,
            "value": button.value // used to store a JSON object containing vm data
        };
    });

    // Return the Slack message object containing the button blocks
    return {
        blocks: [
            {
                "type": "section",
                "text": {
                    "type": "mrkdwn",
                    "text": headerText
                }
            },
            {
                "type": "actions",
                "elements": buttonBlocks
            }
        ],
        text: fallbackText
    };
}        