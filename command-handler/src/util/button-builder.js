export default function buttonBuilder({ buttonsArray, headerText, fallbackText }) {
    let buttonBlocks = buttonsArray.map(button => {
        return {
            "type": "button",
            "text": {
                "type": "plain_text",
                "text": button.text
            },
            "action_id": button.actionId,
            "value": button.value || ""
        };
    });

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