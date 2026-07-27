import { Modal, Blocks, Elements } from 'slack-block-builder';

/*
    Modal to create or update a VM profile: a name plus a block of KEY=VALUE env vars.
    Repo-to-clone is intentionally not here; it's chosen per-create, never saved.

    When `editing` is true the name is LOCKED: rendered as static text (Slack has no
    read-only input) and carried in private_metadata, so an edit always overwrites the
    same profile in place and can't accidentally fork a renamed copy. When creating, the
    name is an editable input.
*/
export default function vmProfileModal({ name = '', envText = '', metaData, editing = false } = {}) {
  const nameBlock = editing
    ? Blocks.Section().text(`*Profile:* ${name}  _(name can't be changed when editing)_`)
    : Blocks.Input({ label: 'Profile name', blockId: 'profile_name' }).element(
        Elements.TextInput({ actionId: 'profile_name' })
          .placeholder('e.g. acme-api')
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
