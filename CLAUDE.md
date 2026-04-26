# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **For AI agents:** See [`.ai/AGENTS.md`](.ai/AGENTS.md) for module import map, key invariants, provisioner API reference, and Proxmox-specific patterns.


## What This Project Does

A Slack bot (Bolt.js, HTTP mode) that lets developers provision and manage VMs via slash commands. It talks to a [GlueOps Provisioner](https://github.com/GlueOps/provisioner) REST API that supports two backends: **libvirt** (bare-metal hypervisors over SSH) and **Proxmox VE** (via the Proxmox REST API). Users create, list, start, stop, delete, and edit VMs entirely through Slack modals and ephemeral messages.

## Development Commands

```bash
npm ci               # Install dependencies
node .               # Start locally (requires .env file)
docker build -t slackbot-developer-workspaces .
docker run --env-file .env -d -p 5000:5000 slackbot-developer-workspaces
```

There are no automated tests or linting tools configured.

## Architecture

**Entry point:** `app.js` — initialises Bolt, registers listeners, starts the Express receiver on `SERVER_PORT` (default 5000). `app-server.js` is a heartbeat monitor on the same port.

**Listener layers** (`listeners/`):
- `commands/` — slash command handlers, auto-discovered by filename. Each exports `{ description, run, button? }`.
- `actions/` — interactive component handlers (button clicks, dropdown changes). Registered in `actions/index.js`.
- `views/` — modal submission handlers. Registered in `views/index.js`.

**Utility modules** (`util/`):
- `libvirt/libvirt-server.js` — all Provisioner REST API calls: create, delete, list, start, stop, edit-tags.
- `get-user-data.js` — builds cloud-init `user_data` for new VMs.
- `token-generator.js` — generates CDE tokens for single-click experience.
- `button-builder.js` — builds Slack Block Kit button rows.
- `format-date.js` — date formatting and VM sort helpers.
- `logger.js` — structured JSON logger.
- `axios-error-handler.js` — normalises axios errors for logging.

**UI builders** (`user-interface/modals/`):
- `vm-create.js` — VM creation modal. Accepts `regionStats` for Proxmox capacity/load context block.
- `vm-edit.js` — VM description edit modal.

## Key Patterns

**Auto-discovery of commands:** Every file in `listeners/commands/` is automatically registered as a slash command. No manual wiring needed. The filename becomes the command name (with optional `test-` prefix in nonprod).

**Environment-based command prefix:** `APP_ENVIRONMENT=prod` registers `/vm`, `/ping`, etc. `APP_ENVIRONMENT=nonprod` registers `/test-vm`, `/test-ping`, etc. — safe parallel testing in the same workspace.

**Modal split — builder vs handler:** Modal JSON is built in `user-interface/modals/`. Submission logic lives in `listeners/views/`. The `callbackId` on the modal connects them. State passes between interactions via `privateMetaData` (JSON-stringified).

**Dispatch action on region select:** The region dropdown in `vm-create.js` has `.dispatchAction(true)`. When a user picks a region, Slack fires the `region` action, handled by `listeners/actions/vm-region.js`. This re-fetches `/v1/regions` and `/v1/get-images` fresh and updates the modal in-place with instance types and — for Proxmox regions — a capacity/load context block.

**Proxmox regionStats:** `/v1/regions` returns capacity/load as separate fields on Proxmox region objects (`total_vcpus`, `free_vcpus`, `total_memory_gb`, `free_memory_gb`, `total_storage_gb`, `free_storage_gb`, `cpu_pct`, `ram_pct`). Libvirt regions return `null` for all these fields. `vm-region.js` builds a `regionStats` object when `cpu_pct != null`, passes it to the modal builder, which renders a three-line context block with emoji-coded load. When `regionStats` is `null` (libvirt), the context block is omitted entirely.

**Over Allocated instance types:** The provisioner appends ` (Over Allocated)` to instance type names when a node's free capacity is less than the type requires. The slackbot passes this string through as-is — both as the dropdown label and as the value sent back to the provisioner on create. The provisioner strips the suffix before lookup.

**User identity:** All operations resolve the Slack user to their email via `client.users.info({ user: body.user.id })`. The email is stored as `owner` in VM tags and used to filter VMs on list.

**All responses are ephemeral:** `chat.postEphemeral` is used throughout — responses are only visible to the triggering user.

## Required Environment Variables

See `example.env` for the full list.

| Variable | Purpose |
|---|---|
| `SIGNING_SECRET` | Slack webhook signature verification |
| `BOT_TOKEN` | Slack Web API token |
| `APP_TOKEN` | Slack app-level token (`connections:write` scope) |
| `PROVISIONER_URL` | Base URL of the Provisioner API |
| `PROVISIONER_API_TOKEN` | Bearer token for Provisioner API |
| `TAILSCALE_AUTH_KEY` | Injected into VM cloud-init user data |
| `GUACAMOLE_CONNECTION_URL` | VNC access URL shown to users after VM creation |
| `APP_ENVIRONMENT` | `prod` or `nonprod` (controls command prefix) |
| `SERVER_PORT` | HTTP port (default: `5000`) |
