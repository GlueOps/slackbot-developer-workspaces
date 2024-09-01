import runButton from "../cmd-handler/run-button.js";
import registeredButtons from '../cmd-handler/buttons.js';

export default function button(app, handler) {
  
    // Register a single action handler for all actions
    app.action(/button_/, async ({ body, ack, say }) => {
      await ack();
  
      // Extract the action ID from the event body
      const actionId = body.actions[0].action_id;

      const commandName = registeredButtons[actionId]?.command || null;

      runButton({
        commandName,
        handler,
        body,
        say,
        })
    });
  }