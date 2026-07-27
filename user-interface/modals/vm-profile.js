import { Modal, Blocks, Elements } from 'slack-block-builder';

/*
    Modal to create / copy / edit a VM profile: a name plus a block of KEY=VALUE env vars.
    Repo-to-clone is intentionally not here; it's chosen per-create, never saved.

    `metaData` carries { channel_id, name? }, and `name` in metaData is the SINGLE source of
    truth for edit-vs-not (the submit handler reads it the same way):
      - name in metaData  → EDIT: the name is LOCKED (static text — Slack has no read-only
        input) so the save overwrites that profile in place, can't fork a rename.
      - no name in metaData → NEW or COPY: the name is an editable input, pre-filled from the
        `name` arg (copy suggests "<source>-copy"; new leaves it blank).
    `envText` pre-fills the env textarea (edit + copy).
*/
// Recommended-keys guidance, pre-seeded into the env textarea for a NEW profile (not edit/
// copy, which show real values). Every line is a comment/blank, so an untouched template
// saves as an empty profile. This is where the guidance lives now that the create modal has
// no env input. Mirrors the grouped/commented style the create modal used to show.
const PROFILE_ENV_TEMPLATE = [
  '# One KEY=VALUE per line. Uncomment a line (remove the leading "# ") and set its value.',
  '# Blank lines, comments, and a blank KEY= are ignored.',
  '#',
  '# GITHUB_TOKEN — required for PRIVATE repo clones and gh auth; public repos work without it.',
  '# GITHUB_TOKEN=',
  '#',
  '# AutoGlue SSH (gluekube_ssh): to auto-create a profile on the VM, uncomment BOTH a URL',
  '# and its token (seeded only when both are set).',
  '#   prod:',
  '# GLUEKUBE_SSH_AUTOGLUE_PROD_URL=https://autoglue.glueopshosted.com/api/v1',
  '# GLUEKUBE_SSH_AUTOGLUE_PROD_TOKEN=',
  '#   nonprod:',
  '# GLUEKUBE_SSH_AUTOGLUE_NONPROD_URL=https://autoglue.glueopshosted.rocks/api/v1',
  '# GLUEKUBE_SSH_AUTOGLUE_NONPROD_TOKEN=',
  '#',
  '# CDE_SETUP_SCRIPT runs at CDE start. Left unset, the default bootstrap `cde-init` runs',
  '# (gh auth + clone your repo + set up AutoGlue). Uncomment + change it to override:',
  '#   <a command>       = run it instead, e.g.  curl setup.example.com | zsh',
  '#   base64:<encoded>  = a complex/multi-line script  (<script> | base64 -w0)',
  '#   true              = skip setup entirely',
  '# CDE_SETUP_SCRIPT=cde-init',
].join('\n');

export default function vmProfileModal({ name = '', envText = '', metaData } = {}) {
  const meta = metaData ? JSON.parse(metaData) : {};
  const editing = Boolean(meta.name);
  const nameBlock = editing
    ? Blocks.Section().text(`*Profile:* ${meta.name}  _(name can't be changed when editing)_`)
    : Blocks.Input({ label: 'Profile name', blockId: 'profile_name' }).element(
        Elements.TextInput({ actionId: 'profile_name' })
          .placeholder('e.g. acme-api')
          .initialValue(name || undefined)
          .maxLength(60)
      );

  return Modal({ title: editing ? 'Edit Profile' : 'New Profile', submit: 'Save', callbackId: 'vm-profile-modal', privateMetaData: metaData })
    .blocks(
      nameBlock,

      ...(editing
        ? []
        : [Blocks.Context().elements('Saving with the name of an existing profile overwrites it.')]),

      Blocks.Input({ label: 'Environment variables', blockId: 'env_vars', optional: true }).element(
        Elements.TextInput({ actionId: 'env_vars' })
          .multiline(true)
          .placeholder('One per line, KEY=VALUE\nGITHUB_TOKEN=ghp_...\nDATABASE_URL=postgres://...')
          // New profile → seed the guidance template; edit/copy → show the real env values.
          .initialValue(envText || (editing ? undefined : PROFILE_ENV_TEMPLATE))
          .maxLength(3000)
      )
    )
    .build();
}
