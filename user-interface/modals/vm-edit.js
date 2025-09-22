import { Modal, Blocks, Elements } from 'slack-block-builder';

export default function vmEditModal({ description, metaData } = {}) {
  return Modal({ title: 'Edit VM Description', submit: 'Submit', callbackId: 'vm-edit-modal', privateMetaData: metaData })
    .blocks(

      Blocks.Input({ label: 'VM Description', blockId: 'description' }).element(
        Elements.TextInput({ actionId: 'description' })
          .placeholder('A short description of the VM')
          .maxLength(100)
          .initialValue(description || '')
      )
    )
    .build();
}
