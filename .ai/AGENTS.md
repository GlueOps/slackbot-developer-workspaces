# Agent Guidance

Operational reference for AI agents working in this repo. Read alongside CLAUDE.md (project overview, architecture, key patterns, env vars).

## Connected Repos

- **[provisioner](https://github.com/GlueOps/provisioner)** — the backend API this bot talks to. Its [`.ai/AGENTS.md`](https://github.com/GlueOps/provisioner/blob/main/.ai/AGENTS.md) documents the full VM lifecycle, the Waggle-backed Proxmox region model (one region per Waggle datacenter; Waggle picks the hypervisor), cloud-init flow, and all endpoint behaviour.
- **[waggle](https://github.com/glueops/waggle)** — the placement oracle behind Proxmox regions. Instance types are Waggle *slots*; the provisioner pre-filters them against Waggle's hypervisor ledger so the bot only ever sees placeable ones. The bot never talks to Waggle directly — only through the provisioner.

---

## Module Import Map

```javascript
// Entry point
import app from './app.js'                                      // Bolt app init + listener registration

// Listeners
import vmCommand from './listeners/commands/vm.js'             // /vm slash command (create/list/start/stop/delete/edit/profile)
import vmRegionCallback from './listeners/actions/vm-region.js' // Dispatch action: region dropdown change
import vmCreateModalCallback from './listeners/views/vm-create-modal.js' // Modal submit: vm-create-modal
import vmEditModalCallback from './listeners/views/vm-edit-modal.js'     // Modal submit: vm-edit-modal
import vmProfileModalCallback from './listeners/views/vm-profile-modal.js' // Modal submit: vm-profile-modal (save profile)

// UI builders
import vmCreateModal from './user-interface/modals/vm-create.js' // Block Kit: VM create modal (profile picker + env + per-VM repo)
import vmEditModal from './user-interface/modals/vm-edit.js'     // Block Kit: VM edit modal
import vmProfileModal from './user-interface/modals/vm-profile.js' // Block Kit: profile create/update modal

// Provisioner API client
import libvirt from './util/libvirt/libvirt-server.js'          // All Provisioner REST API calls

// Profile store (S3, encrypted)
import { requireProfilesConfig, listProfiles, getProfile, saveProfile, deleteProfile } from './util/profile-store.js'
import { encrypt, decrypt, hashEmail, encryptionKeyValid } from './util/profile-crypto.js'

// Utilities
import logger from './util/logger.js'                           // JSON logger; redacts secrets via redact.js
import redactSensitive from './util/redact.js'
import axiosError from './util/axios-error-handler.js'
import buttonBuilder from './util/button-builder.js'
import configUserData from './util/get-user-data.js'            // cloud-init user_data + codespace.env (metadata + user env)
import parseEnvVars from './util/parse-env-vars.js'             // KEY=VALUE textarea (profile modal) -> { env, errors }
import parseRepo from './util/parse-repo.js'                    // repo input -> canonical https .git URL
import { generateCdeToken } from './util/token-generator.js'
import { formatCreatedDate, sortByCreatedAtAsc } from './util/format-date.js'
```

> Note: `requireProfilesConfig()` runs in `app.js` at startup and throws if any required `PROFILES_*` var (incl. a valid 64-hex `PROFILES_ENCRYPTION_KEY`) is missing — the bot will not start without them.

---

## Provisioner API Endpoints Used

All calls go to `process.env.PROVISIONER_URL` with `Authorization: ${process.env.PROVISIONER_API_TOKEN}`.

| Endpoint | Method | Called from | Purpose |
|---|---|---|---|
| `/v1/regions` | GET | `vm.js`, `vm-region.js` | List available regions + instance types. Proxmox regions list only currently-placeable Waggle slots. |
| `/v1/get-images` | GET | `vm.js`, `vm-region.js` | List available VM images |
| `/v1/create` | POST | `libvirt-server.js` | Create a VM |
| `/v1/list` | GET | `libvirt-server.js` | List all VMs (filtered to caller's email client-side) |
| `/v1/start` | POST | `libvirt-server.js` | Start a VM |
| `/v1/stop` | POST | `libvirt-server.js` | Stop a VM |
| `/v1/delete` | DELETE | `libvirt-server.js` | Delete a VM |
| `/v1/edit-tags` | POST | `libvirt-server.js` | Update VM tags/description |

Failure messages append `Reason: <detail>` when the provisioner returns a **4xx** with a string `detail` body (e.g. 409 region-at-capacity, 404 VM-not-found) — see `provisionerDetail` in `libvirt-server.js`. 5xx bodies (generic boilerplate) and FastAPI validation arrays are never surfaced.

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
    "region_name": "proxmox-cluster-1",
    "enabled": true,
    "available_instance_types": [{ "instance_type": "2vcpu-8gb-32ssd", "vcpus": 2, "memory_mb": 8192, "storage_mb": 32768 }],
    "total_vcpus": null, "free_vcpus": null,
    "total_memory_gb": null, "free_memory_gb": null,
    "total_storage_gb": null, "free_storage_gb": null,
    "cpu_pct": null, "ram_pct": null
  }
]
```

The capacity fields are always `null` (legacy schema leftovers) — the bot ignores them. A Proxmox region is one Waggle datacenter (whole cluster) and its `available_instance_types` are the Waggle slots that can *currently* be placed: the provisioner pre-filters against Waggle's hypervisor ledger, so a listed slot is creatable right now.

---

## Key Invariants

These are load-bearing. Do not change without understanding the impact.

1. **`await ack()` is always the first line** in action handlers (`vm-region.js`) and view handlers (`vm-create-modal.js`, `vm-edit-modal.js`). Slack requires acknowledgement within 3 seconds or retries the request.

2. **All user-facing responses use `chat.postEphemeral`** — only visible to the triggering user. Never use `chat.postMessage` for VM operation feedback.

3. **User identity is always resolved to email** via `client.users.info({ user: body.user.id })`. The email is stored as `owner` in VM tags. `listServers` filters VMs client-side by matching `server.tags.owner === userEmail`.

4. **No capacity UI — the instance-type list IS the availability signal** — the provisioner only lists instance types that can actually be placed (Proxmox: Waggle slots with room on some hypervisor). The bot renders the list as-is; do not add client-side capacity math or re-introduce a stats block from the always-`null` capacity fields.

5. **Instance-type *values* round-trip unchanged; *labels* are enriched** — for Proxmox regions the `instance_type` value is a Waggle slot name; the provisioner resolves it back to a slot at create time. The dropdown option **value** is the bare slot name and round-trips verbatim (also written verbatim to `GLUEOPS_CDE_INSTANCE_TYPE` in the cloud-init env file); the option **label** appends specs from the payload — `name (N vCPU • N GB RAM • N GB disk)` — with a 75-char Slack-limit fallback to the bare name (`vm-create.js`). If a datacenter is full, `/v1/create` fails cleanly (Waggle placement is all-or-nothing) — there is no "(Over Allocated)" suffix.

6. **`\n` in a single `Bits.Mrkdwn()` element for multi-line context blocks** — Slack context blocks render multiple `elements` inline (side-by-side). To get separate lines, use a single `Bits.Mrkdwn()` element with `\n` separating the lines. Do not split into separate elements.

7. **Region names are stable identifiers** — a Proxmox region name is the Waggle datacenter / cluster name (e.g. `proxmox-cluster-1`); the specific hypervisor is chosen by Waggle at create time and never appears in the region name. Libvirt region names are static strings from config. Region names are used as both the dropdown label (`text`) and the value (`value`) sent back to the provisioner. They round-trip unchanged.

8. **Modal state passes via `privateMetaData`** — JSON-stringified. Set on modal open, read in view handlers via `JSON.parse(view.private_metadata)`. Contains at minimum `{ channel_id, vmCount }`; the create modal also carries `profiles` (names, so the picker survives re-render); edit flows add `{ serverName, region, tags }`; the profile modal carries `{ channel_id, name }` where `name` present ⇒ editing.

9. **`dispatchAction(true)` on the region input** — this is what triggers `vm-region.js` on region selection. If you add other inputs that should trigger an action on change, they also need `.dispatchAction(true)` and a registered action handler.

10. **`codespace.env` namespaces are strict** — `get-user-data.js` writes platform metadata (`SERVER_NAME`, `REGION`, `CLONE_REPO`, …) prefixed `GLUEOPS_CDE_`, and user-supplied env vars **verbatim** (no prefix). The `GLUEOPS_CDE_` prefix is reserved for the platform: user keys in that namespace are dropped. Values are written for docker `--env-file` (bare `KEY=VALUE`, no quote stripping) — see the `codespace.env` contract in the codespaces repo.

11. **The profile store is encrypted client-side, and its on-disk format is load-bearing.** `profile-crypto.js` uses AES-256-GCM (random 12-byte IV, GCM tag) over the whole JSON document; envelope is `v1.<ivHex>.<tagHex>.<ctHex>`. The S3 object key is `HMAC-SHA256(normalized email)` keyed with the **same** `PROFILES_ENCRYPTION_KEY`. Changing the envelope, the HMAC input, or the key orphans all existing objects. `hashEmail()` throws on a missing/invalid email (never hash `"undefined"` into a shared object).

12. **Repo-to-clone is normalised, not raw.** `parse-repo.js` accepts `owner/repo`, scheme-less, full, `.git`, and browser URLs, and always stores a canonical `https://github.com/owner/repo.git`. SSH, tokenised, and non-github hosts are rejected. The result is written to the VM tag `clone_repo` and `GLUEOPS_CDE_CLONE_REPO`, and shown as `Repo:` in the create confirmation and `/vm list`.

13. **Secrets must never reach logs.** `logger.js` runs every record through `redact.js`. Do not bypass the logger for anything that could carry a decrypted value, the encryption key, a token, or the cloud-init `user_data`.

14. **`requireProfilesConfig()` gates startup.** Called in `app.js`; throws if any required `PROFILES_*` var is missing or the encryption key isn't 64 hex chars. The bot won't boot without valid S3 + encryption config.

15. **Editing a profile overwrites in place.** On edit the name is passed in `private_metadata` and rendered as static text (Slack has no read-only input); the submit handler derives `editing` from `meta.name`. Never re-introduce an editable name field on the edit path — it would fork a renamed copy.

---

## VM Create Modal Flow

```
/vm create [count]
  → vm.js: opens loading modal
  → fetches /v1/regions + /v1/get-images in parallel
  → loads the user's profile names from S3 (best-effort)
  → updates modal via vmCreateModal({ regions, images, servers: [], profiles })
     (profile names also stashed in privateMetaData so the picker survives re-render)

Modal fields: [profile picker if any, else a "/vm profile new" hint] · region
              · image · server type · per-VM {description, repo} · single-click
              (NO env textarea — env vars come only from the selected profile)

User selects a region (dispatch action fires)
  → vm-region.js: re-fetches /v1/regions + /v1/get-images
  → finds selected regionObj, extracts its instance types (already pre-filtered
     by the provisioner to what's currently placeable); zero instance types for a
     selected region renders a ":warning: region is at capacity" context note
     (submit stays blocked via the 'placeholder' option value)
  → re-seeds image, descriptions, repos, single-click, profile from view.state.values
     (so switching regions does NOT wipe input; server type intentionally resets)
  → updates modal via vmCreateModal({ ..., profiles, selected* })

User submits modal
  → vm-create-modal.js: validate each repo (parse-repo) and reject placeholder
     region/image/server — BEFORE ack(); inline errors on failure
  → if a profile was picked: getProfile() and use its env as the ONLY env source
     (abort creation if it can't be loaded); no profile → a plain VM with no env
  → calls libvirt.createServer() per VM (parallel for batch; batch=true suppresses per-VM chatter)
  → createServer writes codespace.env (metadata + user env), tags clone_repo, posts result
     (single: Server/Profile/Repo/Access; batch: one summary line per VM)
```

---

## /vm profile Flow

```
/vm profile            → lists the user's profiles (env KEYS shown, values never)
                         each row: [Edit] [Delete w/ confirm]; plus a [New profile] button
/vm profile new        → opens empty vmProfileModal (editable name)
/vm profile delete <n> → deleteProfile()

[Edit] button (button_profile_edit)
  → getProfile() → open vmProfileModal prefilled { name, envText }, name LOCKED
    (name carried in privateMetaData, rendered as static text)

Submit vm-profile-modal
  → vm-profile-modal.js: name from meta (edit) or field (new); parse+validate env
  → saveProfile(email, name, { env }) → read-modify-write the encrypted per-user S3 doc
  → ephemeral confirmation

Store: profile-store.js → one JSON doc per user at profiles/<hmac(email)>.json,
       whole-doc AES-256-GCM encrypted (profile-crypto.js). Every S3 call is
       bounded by PROFILES_S3_TIMEOUT_MS. Profile buttons route via
       actions/buttons.js (^button_profile_) to the vm command's button handler.
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

Secrets are stripped automatically: every record passes through `redact.js`, which redacts values by sensitive key name and long base64 blobs (incl. an echoed cloud-init `user_data`). This is a safety net, not a licence to log secrets — still avoid putting decrypted values, keys, or tokens into log payloads.

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
