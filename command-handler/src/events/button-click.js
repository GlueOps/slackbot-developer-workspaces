/*
  This file is responsible for handling button click events.
*/

import runButton from "../cmd-handler/run-button.js";
import registeredButtons from '../cmd-handler/buttons.js';

export default function button(app, handler) {
  
    // Register a single action handler for all actions
    app.action(/button_/, async ({ body, ack, say }) => {
      // Acknowledge the action so the app doesn't timeout
      await ack();
  
      // Extract the action ID from the event body
      const actionId = body.actions[0].action_id;

      let commandName = null;
      // Check for an exact match first
      if (registeredButtons[actionId]) {
        // set the command to handle the button to the matched button
        commandName = registeredButtons[actionId].command;
      } else {
          /*
          Iterate all of the registered buttons to check for a regex match
          destructuring the pattern and config from the registeredButtons object
          */
          for (const [pattern, config] of Object.entries(registeredButtons)) {
              /*
              check if the registered button is a regex pattern and 
              if the pattern matches the action ID
              */
              if (config.isRegex && new RegExp(pattern).test(actionId)) {
                  // set the command to handle the button to the matched button
                  commandName = config.command;
                  // break out of the loop if a match is found
                  break;
              }
          }
      }

      // call the runButton function to run the button handler
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