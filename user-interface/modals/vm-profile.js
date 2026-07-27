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
          .initialValue(envText || undefined)
          .maxLength(3000)
      )
    )
    .build();
}
