import runButton from "../cmd-handler/run-button.js";
import registeredButtons from '../cmd-handler/buttons.js';

export default function button(app, handler) {
  
    // Register a single action handler for all actions
    app.action(/button_/, async ({ body, ack, say }) => {
      await ack();
  
      // Extract the action ID from the event body
      const actionId = body.actions[0].action_id;

      // Check for an exact match first
      if (registeredButtons[actionId]) {
        commandName = registeredButtons[actionId].command;
      } else {
          // If no exact match, check for a regex pattern match
          for (const [pattern, config] of Object.entries(registeredButtons)) {
              if (config.isRegex && new RegExp(pattern).test(actionId)) {
                  commandName = config.command;
                  break;
              }
          }
      }

      runButton({
        commandName,
        actionId,
        handler,
        app,
        body,
        say,
        })
    });
  }