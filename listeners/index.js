import shortcutsListener from './shortcuts/index.js';
import viewsListener from './views/index.js';
import eventsListener from './events/index.js';
import actionsListener from './actions/index.js';
import commandsListener from './commands/index.js';

const registerListeners = async (app) => {
  shortcutsListener(app);
  viewsListener(app);
  eventsListener(app);
  actionsListener(app);
  await commandsListener(app);
};

export default registerListeners;
