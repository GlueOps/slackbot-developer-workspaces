import { Modal, Blocks, Elements } from 'slack-block-builder';

/*
    Modal to create or update a VM profile: a name plus a block of KEY=VALUE env vars.
    Saving under an existing name overwrites it — that's how editing works. Repo-to-clone
    is intentionally not here; it's chosen per-create, never saved.
*/
export default function vmProfileModal({ name = '', envText = '', metaData } = {}) {
  return Modal({ title: 'VM Profile', submit: 'Save', callbackId: 'vm-profile-modal', privateMetaData: metaData })
    .blocks(
      Blocks.Input({ label: 'Profile name', blockId: 'profile_name' }).element(
        Elements.TextInput({ actionId: 'profile_name' })
          .placeholder('e.g. acme-api')
          .initialValue(name || undefined)
          .maxLength(60)
      ),

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
