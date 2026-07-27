# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **For AI agents:** See [`.ai/AGENTS.md`](.ai/AGENTS.md) for module import map, key invariants, provisioner API reference, and Proxmox-specific patterns.


## What This Project Does

A Slack bot (Bolt.js, HTTP mode) that lets developers provision and manage VMs via slash commands. It talks to a [GlueOps Provisioner](https://github.com/GlueOps/provisioner) REST API that supports two backends: **libvirt** (bare-metal hypervisors over SSH) and **Proxmox VE** (via the Proxmox REST API). Users create, list, start, stop, delete, and edit VMs entirely through Slack modals and ephemeral messages.

On create, a developer can auto-clone a **GitHub repo** and apply a saved **profile** — a reusable bundle of env vars stored per-user in S3, encrypted at rest. **Environment variables are set only via profiles** (the create modal has no env textarea). Profiles are managed with `/vm profile` (list / new / delete, with Edit/Copy buttons).

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
- `get-user-data.js` — builds cloud-init `user_data` for new VMs. Writes `/etc/glueops/codespace.env`: platform metadata as `GLUEOPS_CDE_*`, user-supplied env vars **verbatim**.
- `profile-store.js` — S3-backed store for per-user VM profiles (env-var bundles). Whole document encrypted at rest; the S3 object key is a keyed HMAC of the email. Every S3 call is bounded by `PROFILES_S3_TIMEOUT_MS`.
- `profile-crypto.js` — AES-256-GCM `encrypt`/`decrypt` of the profile document + keyed `hashEmail()` for the object key. Guards against a missing email.
- `parse-env-vars.js` — parses the `KEY=VALUE` env textarea (now in the **profile** create/edit modal); reports malformed lines for inline modal errors.
- `parse-repo.js` — validates + normalises a repo-to-clone input to a canonical `https://github.com/owner/repo.git` URL.
- `redact.js` — strips secrets from log records; wired into `logger.js`.
- `token-generator.js` — generates CDE tokens for single-click experience.
- `button-builder.js` — builds Slack Block Kit button rows.
- `format-date.js` — date formatting and VM sort helpers.
- `logger.js` — structured JSON logger; redacts secrets via `redact.js` before output.
- `axios-error-handler.js` — normalises axios errors for logging.

**UI builders** (`user-interface/modals/`):
- `vm-create.js` — VM creation modal. Accepts `regionStats` for the Proxmox capacity/load context block, an optional profile picker (or a hint to run `/vm profile new` when the user has none), and per-VM description + repo inputs. **No env textarea** — env vars come from the selected profile. Takes initial-value params so a region change rebuilds it without losing input.
- `vm-edit.js` — VM description edit modal.
- `vm-profile.js` — create/update a VM profile (name + env vars); a new profile pre-seeds a recommended-keys guidance template in the env textarea. The name is locked (rendered as static text) when editing.

## Key Patterns

**Auto-discovery of commands:** Every file in `listeners/commands/` is automatically registered as a slash command. No manual wiring needed. The filename becomes the command name (with optional `test-` prefix in nonprod).

**Environment-based command prefix:** `APP_ENVIRONMENT=prod` registers `/vm`, `/ping`, etc. `APP_ENVIRONMENT=nonprod` registers `/test-vm`, `/test-ping`, etc. — safe parallel testing in the same workspace.

**Modal split — builder vs handler:** Modal JSON is built in `user-interface/modals/`. Submission logic lives in `listeners/views/`. The `callbackId` on the modal connects them. State passes between interactions via `privateMetaData` (JSON-stringified).

**Dispatch action on region select:** The region dropdown in `vm-create.js` has `.dispatchAction(true)`. When a user picks a region, Slack fires the `region` action, handled by `listeners/actions/vm-region.js`. This re-fetches `/v1/regions` and `/v1/get-images` fresh and updates the modal in-place with instance types and — for Proxmox regions — a capacity/load context block.

**Proxmox regionStats:** `/v1/regions` returns capacity/load as separate fields on Proxmox region objects (`total_vcpus`, `free_vcpus`, `total_memory_gb`, `free_memory_gb`, `total_storage_gb`, `free_storage_gb`, `cpu_pct`, `ram_pct`). Libvirt regions return `null` for all these fields. `vm-region.js` builds a `regionStats` object when `cpu_pct != null`, passes it to the modal builder, which renders a three-line context block with emoji-coded load. When `regionStats` is `null` (libvirt), the context block is omitted entirely.

**Over Allocated instance types:** The provisioner appends ` (Over Allocated)` to instance type names when a node's free capacity is less than the type requires. The slackbot passes this string through as-is — as the dropdown label, as the value sent back to the provisioner on create, and as `GLUEOPS_CDE_INSTANCE_TYPE` in the cloud-init env file. The provisioner strips the suffix before lookup.

**User identity:** All operations resolve the Slack user to their email via `client.users.info({ user: body.user.id })`. The email is stored as `owner` in VM tags and used to filter VMs on list.

**All responses are ephemeral:** `chat.postEphemeral` is used throughout — responses are only visible to the triggering user.

**Custom env vars & repo clone:** env vars are defined in a **profile** (not on the create modal, which has only a profile picker + a per-VM repo field). A profile's env (`KEY=VALUE` per line) is parsed by `parse-env-vars.js` and written **verbatim** to `codespace.env` (dev apps expect `GITHUB_TOKEN`, not `GLUEOPS_CDE_GITHUB_TOKEN`); the `GLUEOPS_CDE_` prefix is reserved for platform metadata, and user keys in that namespace are dropped. The repo is validated/normalised by `parse-repo.js`, stored on the VM tag `clone_repo`, emitted as `GLUEOPS_CDE_CLONE_REPO`, and shown in the create confirmation and `/vm list`.

**VM profiles (S3 + encryption):** a profile is a per-user, named bundle of env vars stored as one JSON document per user in S3 (`profile-store.js`). The whole document is encrypted with AES-256-GCM (`profile-crypto.js`) using `PROFILES_ENCRYPTION_KEY`, and the S3 object key is a keyed HMAC of the normalized email — so the bucket reveals neither contents nor identity. Encryption is **client-side** (Node `crypto`), not S3 SSE. The create modal shows an optional profile picker (only when the user has profiles, never a default; otherwise a hint to run `/vm profile new`); on submit the selected profile's env is the **only** env source, and a profile that can't be loaded aborts creation (never a silently secretless VM). Profiles are managed via `/vm profile` + Edit/Delete/New buttons; **editing overwrites in place** (the name is locked). All `PROFILES_S3_*` + `PROFILES_ENCRYPTION_KEY` vars are **required at startup** (`requireProfilesConfig()` in `app.js`).

**Log redaction:** `logger.js` runs every record through `redact.js`, which strips secret-bearing fields (by key name and by long base64 blobs) — including the cloud-init `user_data` if the provisioner echoes it in an error. No call site can leak secrets to logs.

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
| `PROFILES_S3_ENDPOINT` | S3 endpoint URL for the profile store |
| `PROFILES_S3_BUCKET` | S3 bucket for the profile store |
| `PROFILES_S3_REGION` | S3 region |
| `PROFILES_S3_ACCESS_KEY_ID` | S3 access key id |
| `PROFILES_S3_SECRET_ACCESS_KEY` | S3 secret access key |
| `PROFILES_S3_PREFIX` | Optional S3 key prefix (default `profiles/`) |
| `PROFILES_S3_TIMEOUT_MS` | Optional per-S3-call timeout in ms (default `5000`) |
| `PROFILES_ENCRYPTION_KEY` | 32-byte key as 64 hex chars, encrypts the profile store at rest. Generate: `openssl rand -hex 32` |

The `PROFILES_*` vars (except the two optional ones) are **required** — the bot fails to start without them (`requireProfilesConfig()`).
