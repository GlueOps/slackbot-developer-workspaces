# Copilot Instructions

## Build & Run

```bash
# Build Docker image
docker build -t slackbot-developer-workspaces .

# Run with environment variables
docker run --env-file .env -d -p 5000:5000 slackbot-developer-workspaces

# Install dependencies locally
npm ci

# Start locally (requires .env file)
node .
```

There are no tests or linting tools configured.

## Architecture

This is a **Slack bot** that provisions and manages developer VMs via a GlueOps Provisioner REST API. Users interact through Slack slash commands to create, list, start, stop, delete, and edit VMs.

**Request flow:**

```
Slack → ExpressReceiver (port 5000) → Bolt app
  → listeners/commands/   (slash commands)
  → listeners/actions/    (button clicks, dropdown changes)
  → listeners/views/      (modal submissions)
       ↓
  util/libvirt/libvirt-server.js  (Provisioner API calls via axios)
       ↓
  app.client.chat.postEphemeral() (user-facing responses)
```

**Environment-based command naming:** `APP_ENVIRONMENT=prod` registers `/vm`, `/ping`, etc. `APP_ENVIRONMENT=nonprod` registers `/test-vm`, `/test-ping`, etc. — this allows safe testing without interfering with the production bot in the same Slack workspace.

## Key Conventions

### Adding a new command

Create `listeners/commands/mycommand.js` — it is **auto-discovered and registered** based on the filename. No manual registration needed.

Every command file exports a default object with this shape:

```javascript
export default {
  description: 'What this command does',

  run: async ({ event, app, body, commandPrefix }) => {
    // event = Slack slash command payload
    // body = raw request body
    // commandPrefix = '' (prod) or 'test-' (nonprod)
  },

  // Optional: handle button clicks routed to this command
  button: ({ app, body, actionId, commandPrefix }) => { ... }
}
```

### Button registration

Buttons must be registered in `listeners/actions/buttons.js`. Supports both exact and regex patterns:

```javascript
const registeredButtons = {
  'exact_action_id': { command: 'mycommand' },
  '^button_start_': { command: 'vm', isRegex: true }
};
```

Action IDs use `snake_case` with a `button_` prefix. The router in `button-click.js` tries exact match first, then iterates regex patterns.

### Modals are split into two parts

- **Builder** in `user-interface/modals/` — returns the Block Kit JSON. Pass data through `privateMetaData`.
- **Handler** in `listeners/views/` — must call `await ack()` as the **first line**, then parse `view.state.values` and `JSON.parse(view.private_metadata)`.
- The `callbackId` on the modal connects the builder to the handler. Register the handler in `listeners/views/index.js`.

### Slack API calls

All user-facing responses use `chat.postEphemeral` (only visible to the triggering user). User identity is always resolved to email via `client.users.info({ user: body.user.id })` — VMs are tagged with `owner: userEmail`.

### Logging

```javascript
import logger from '../../util/logger.js';
const log = logger('my-module-name');

log.info('message', { key: 'value' });   // structured JSON
log.error('failed', axiosError(error));  // use axiosError() from util/axios-error-handler.js
```

### Axios error handling

Always wrap provisioner API errors with `axiosError(error)` from `util/axios-error-handler.js` before logging — it normalizes the error into a structured object.

## Environment Variables

See `example.env` for all required variables. Key ones:

| Variable | Purpose |
|---|---|
| `SIGNING_SECRET` | Slack webhook signature verification |
| `BOT_TOKEN` | Slack Web API calls |
| `PROVISIONER_URL` | Base URL for VM provisioner API |
| `PROVISIONER_API_TOKEN` | Bearer token for provisioner |
| `TAILSCALE_AUTH_KEY` | Injected into VM cloud-init scripts |
| `GUACAMOLE_CONNECTION_URL` | VNC access URL shown to users |
| `APP_ENVIRONMENT` | `prod` or `nonprod` (controls command prefix) |
| `SERVER_PORT` | HTTP port (default: `5000`) |

## Module System

All files use ES modules (`import`/`export default`). The `package.json` sets `"type": "module"`.
