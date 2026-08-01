# Changelog

## [4.2.0](https://github.com/GlueOps/slackbot-developer-workspaces/compare/v4.1.0...v4.2.0) (2026-08-01)


### Features

* adapt to waggle-backed proxmox regions ([#497](https://github.com/GlueOps/slackbot-developer-workspaces/issues/497)) ([9bd03d0](https://github.com/GlueOps/slackbot-developer-workspaces/commit/9bd03d0ed87beec3aac50c5a60d1ca2bb829aaaf))


### Miscellaneous Chores

* add Apache-2.0 LICENSE ([#494](https://github.com/GlueOps/slackbot-developer-workspaces/issues/494)) ([b9af77b](https://github.com/GlueOps/slackbot-developer-workspaces/commit/b9af77b88cae4419ebbb8c3392745dfc4a504228))

## [4.1.0](https://github.com/GlueOps/slackbot-developer-workspaces/compare/v4.0.0...v4.1.0) (2026-07-27)


### Features

* make VM profiles the only way to set env vars on create ([#491](https://github.com/GlueOps/slackbot-developer-workspaces/issues/491)) ([dae8417](https://github.com/GlueOps/slackbot-developer-workspaces/commit/dae84174f241860a3257352e8e2f6ef4457a4255))


### Bug Fixes

* accept a scheme-less PROFILES_S3_ENDPOINT and validate it at startup ([#490](https://github.com/GlueOps/slackbot-developer-workspaces/issues/490)) ([4c68461](https://github.com/GlueOps/slackbot-developer-workspaces/commit/4c684618c874a71234f34b56e04e18f68f44963e))

## [4.0.0](https://github.com/GlueOps/slackbot-developer-workspaces/compare/v3.41.1...v4.0.0) (2026-07-27)


### ⚠ BREAKING CHANGES

* new REQUIRED environment variables — the bot will not start without them:
    - PROFILES_S3_ENDPOINT — S3 endpoint URL for the profile store
    - PROFILES_S3_BUCKET — S3 bucket name
    - PROFILES_S3_REGION — S3 region
    - PROFILES_S3_ACCESS_KEY_ID — S3 access key id
    - PROFILES_S3_SECRET_ACCESS_KEY — S3 secret access key
    - PROFILES_ENCRYPTION_KEY — 32-byte key as 64 hex chars; generate with `openssl rand -hex 32`
    Optional: PROFILES_S3_PREFIX (default `profiles/`), PROFILES_S3_TIMEOUT_MS (default 5000).

### Features

* custom env vars, repo cloning, and S3-backed VM profiles ([#489](https://github.com/GlueOps/slackbot-developer-workspaces/issues/489)) ([5cba5d4](https://github.com/GlueOps/slackbot-developer-workspaces/commit/5cba5d4180dfd3e15c78ff24dbed5113fecec6d1))
* write workspace metadata to /etc/glueops/codespace.env ([#488](https://github.com/GlueOps/slackbot-developer-workspaces/issues/488)) ([57a0e4a](https://github.com/GlueOps/slackbot-developer-workspaces/commit/57a0e4ab007c25a7765ee7a660e8f425f6950922))


### Miscellaneous Chores

* **fallback:** update actions/checkout ([#487](https://github.com/GlueOps/slackbot-developer-workspaces/issues/487)) ([81197dc](https://github.com/GlueOps/slackbot-developer-workspaces/commit/81197dcc9a802f1f4a78d1ba1e3dcf1abedfec4b))
* **fallback:** update docker/setup-qemu-action ([#483](https://github.com/GlueOps/slackbot-developer-workspaces/issues/483)) ([8ba1968](https://github.com/GlueOps/slackbot-developer-workspaces/commit/8ba196857b365aa8397a773ac001bfb9e01f8bbd))
* **patch:** update dataaxiom/ghcr-cleanup-action to v1.2.2 #patch ([#484](https://github.com/GlueOps/slackbot-developer-workspaces/issues/484)) ([b2bd9f5](https://github.com/GlueOps/slackbot-developer-workspaces/commit/b2bd9f5970ed77cba496b0b534c4022d6c1b3d8e))

## [3.41.1](https://github.com/GlueOps/slackbot-developer-workspaces/compare/v3.41.0...v3.41.1) (2026-06-30)


### Continuous Integration

* bring release-please config up to GlueOps convention ([#481](https://github.com/GlueOps/slackbot-developer-workspaces/issues/481)) ([a2b9125](https://github.com/GlueOps/slackbot-developer-workspaces/commit/a2b912547e8a0dd0b403fc6d6266cdeacb1f62ce))

## [3.41.0](https://github.com/GlueOps/slackbot-developer-workspaces/compare/v3.40.0...v3.41.0) (2026-06-29)


### Features

* consolidate dependency updates ([#478](https://github.com/GlueOps/slackbot-developer-workspaces/issues/478)) ([e644893](https://github.com/GlueOps/slackbot-developer-workspaces/commit/e644893caf819236ae8a3c81dec3cad330d158bb))
