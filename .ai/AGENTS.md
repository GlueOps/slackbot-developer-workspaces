# Agent Guidance

Operational reference for AI agents working in this repo. Read alongside CLAUDE.md (project overview, architecture, key patterns, env vars).

## Connected Repos

- **[provisioner](https://github.com/GlueOps/provisioner)** — the backend API this bot talks to. Its [`.ai/AGENTS.md`](https://github.com/GlueOps/provisioner/blob/main/.ai/AGENTS.md) documents the full VM lifecycle, Proxmox region name format, how `(Over Allocated)` is appended to instance types, cloud-init flow, and all endpoint behaviour.

---

## Module Import Map

```javascript
// Entry point
import app from './app.js'                                      // Bolt app init + listener registration

// Listeners
import vmCommand from './listeners/commands/vm.js'             // /vm slash command (create/list/start/stop/delete/edit)
import vmRegionCallback from './listeners/actions/vm-region.js' // Dispatch action: region dropdown change
import vmCreateModalCallback from './listeners/views/vm-create-modal.js' // Modal submit: vm-create-modal
import vmEditModalCallback from './listeners/views/vm-edit-modal.js'     // Modal submit: vm-edit-modal

// UI builders
import vmCreateModal from './user-interface/modals/vm-create.js' // Block Kit: VM create modal
import vmEditModal from './user-interface/modals/vm-edit.js'     // Block Kit: VM edit modal

// Provisioner API client
import libvirt from './util/libvirt/libvirt-server.js'          // All Provisioner REST API calls

// Utilities
import logger from './util/logger.js'
import axiosError from './util/axios-error-handler.js'
import buttonBuilder from './util/button-builder.js'
import configUserData from './util/get-user-data.js'
import { generateCdeToken } from './util/token-generator.js'
import { formatCreatedDate, sortByCreatedAtAsc } from './util/format-date.js'
```

---

## Provisioner API Endpoints Used

All calls go to `process.env.PROVISIONER_URL` with `Authorization: ${process.env.PROVISIONER_API_TOKEN}`.

| Endpoint | Method | Called from | Purpose |
|---|---|---|---|
| `/v1/regions` | GET | `vm.js`, `vm-region.js` | List available regions + instance types. Proxmox regions include capacity/load fields. |
| `/v1/get-images` | GET | `vm.js`, `vm-region.js` | List available VM images |
| `/v1/create` | POST | `libvirt-server.js` | Create a VM |
| `/v1/list` | GET | `libvirt-server.js` | List all VMs (filtered to caller's email client-side) |
| `/v1/start` | POST | `libvirt-server.js` | Start a VM |
| `/v1/stop` | POST | `libvirt-server.js` | Stop a VM |
| `/v1/delete` | DELETE | `libvirt-server.js` | Delete a VM |
| `/v1/edit-tags` | POST | `libvirt-server.js` | Update VM tags/description |

### `/v1/regions` response shape

```json
[
  {
    "region_name": "us-east-libvirt-01",
    "enabled": true,
    "available_instance_types": [{ "instance_type": "2vcpu-8gb-32ssd", "vcpus": 2, "memory_mb": 8192, "storage_mb": 32000 }],
    "total_vcpus": null, "free_vcpus": null,
    "total_memory_gb": null, "free_memory_gb": null,
    "total_storage_gb": null, "free_storage_gb": null,
    "cpu_pct": null, "ram_pct": null
  },
  {
    "region_name": "proxmox-cluster-1-pve-node-01",
    "enabled": true,
    "available_instance_types": [{ "instance_type": "2vcpu-8gb-32ssd (Over Allocated)", "vcpus": 2, "memory_mb": 8192, "storage_mb": 32000 }],
    "total_vcpus": 40, "free_vcpus": 32,
    "total_memory_gb": 128, "free_memory_gb": 96,
    "total_storage_gb": 2000, "free_storage_gb": 1800,
    "cpu_pct": 15, "ram_pct": 25
  }
]
```

Libvirt regions have `null` for all capacity/load fields. Proxmox regions have integers.

---

## Key Invariants

These are load-bearing. Do not change without understanding the impact.

1. **`await ack()` is always the first line** in action handlers (`vm-region.js`) and view handlers (`vm-create-modal.js`, `vm-edit-modal.js`). Slack requires acknowledgement within 3 seconds or retries the request.

2. **All user-facing responses use `chat.postEphemeral`** — only visible to the triggering user. Never use `chat.postMessage` for VM operation feedback.

3. **User identity is always resolved to email** via `client.users.info({ user: body.user.id })`. The email is stored as `owner` in VM tags. `listServers` filters VMs client-side by matching `server.tags.owner === userEmail`.

4. **`regionStats` is `null` for libvirt, populated for Proxmox** — the guard `regionObj.cpu_pct != null` in `vm-region.js` detects which backend a region belongs to. The modal's `regionStats != null` check controls whether the capacity/load context block renders. Do not change this guard without testing both backends.

5. **`(Over Allocated)` suffix passes through unchanged** — the provisioner appends ` (Over Allocated)` to instance type names when a node is under-resourced. The slackbot displays this label as-is and sends it back to the provisioner as the `instance_type` value. The provisioner strips the suffix before VM creation. Do not strip it in the slackbot.

6. **`\n` in a single `Bits.Mrkdwn()` element for multi-line context blocks** — Slack context blocks render multiple `elements` inline (side-by-side). To get separate lines, use a single `Bits.Mrkdwn()` element with `\n` separating the lines. Do not split into separate elements.

7. **Region names are stable identifiers** — Proxmox region names are bare `{cluster}-{node}` strings (e.g. `proxmox-cluster-1-pve-node-01`). Libvirt region names are static strings from config. Region names are used as both the dropdown label (`text`) and the value (`value`) sent back to the provisioner. They round-trip unchanged.

8. **Modal state passes via `privateMetaData`** — JSON-stringified. Set on modal open, read in view handlers via `JSON.parse(view.private_metadata)`. Contains at minimum `{ channel_id, vmCount }`. Extended with `{ serverName, region, tags }` for edit flows.

9. **`dispatchAction(true)` on the region input** — this is what triggers `vm-region.js` on region selection. If you add other inputs that should trigger an action on change, they also need `.dispatchAction(true)` and a registered action handler.

---

## VM Create Modal Flow

```
/vm create [count]
  → vm.js: opens loading modal
  → fetches /v1/regions + /v1/get-images in parallel
  → updates modal via vmCreateModal({ regions, images, servers: [], regionStats: null })

User selects a region (dispatch action fires)
  → vm-region.js: re-fetches /v1/regions + /v1/get-images
  → finds selected regionObj, extracts instance types + regionStats
  → updates modal via vmCreateModal({ regions, images, servers, regionStats })
  → if Proxmox: context block shows Total / Unallocated / Current load
  → if libvirt: no context block (regionStats is null)

User submits modal
  → vm-create-modal.js: reads region, image, instance_type, descriptions from view.state.values
  → calls libvirt.createServer() for each VM (parallel for batch)
  → posts ephemeral result with server name + access URL
```

---

## Adding a New Command

1. Create `listeners/commands/mycommand.js` — auto-discovered, no manual registration.
2. Export default: `{ description: '...', run: async ({ event, app, body, commandPrefix }) => { ... } }`
3. Add the `/mycommand` slash command in the Slack API dashboard.
4. If your command needs button handlers, add them to `listeners/actions/buttons.js` and handle in the `button:` export.

---

## Logging Conventions

```javascript
import logger from '../../util/logger.js';
const log = logger('optional-module-name');

log.info('message', { key: 'value' });
log.error('failed', axiosError(error));   // always use axiosError() for axios errors
```

---

## Commit Conventions

All commits must follow [Conventional Commits](https://www.conventionalcommits.org/):

```
type(scope): short description

Optional body explaining why, not what.
```

**Types:**
| Type | When to use |
|---|---|
| `feat` | New feature or capability |
| `fix` | Bug fix |
| `docs` | Documentation only |
| `refactor` | Code change that neither fixes a bug nor adds a feature |
| `chore` | Build, deps, config — no production code change |
| `ci` | CI/CD pipeline changes |
| `perf` | Performance improvement |
| `revert` | Reverts a previous commit |

**Examples:**
```
feat: show Proxmox capacity and load in VM create modal
fix: handle silent API failure in region selection with user-facing error
docs: add .ai/AGENTS.md with module map and key invariants
refactor: extract regionStats from region object in vm-region dispatch action
```

**Rules:**
- Subject line is lowercase, no trailing period, 72 chars max
- Use imperative mood ("add" not "added", "fix" not "fixed")
- Breaking changes must include `BREAKING CHANGE:` in the commit body or `!` after the type: `feat!: change region name format`
