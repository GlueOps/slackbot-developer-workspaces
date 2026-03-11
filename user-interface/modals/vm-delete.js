import { Modal, Blocks, Elements, Bits } from 'slack-block-builder';
import { formatCreatedDate, sortByCreatedAtAsc } from '../../util/format-date.js';

export default function vmDeleteModal({ servers = [], metaData } = {}) {
  const sorted = [...servers].sort(sortByCreatedAtAsc);

  const options = sorted.map(server => {
    const description = server.tags.description || 'No description';
    const createdDate = formatCreatedDate(server.tags.created_at);
    return Bits.Option({
      text: `${server.serverName} — ${description}`,
      value: JSON.stringify({ serverName: server.serverName, region: server.region }),
      description: `Created: ${createdDate}`
    });
  });

  return Modal({ title: 'Delete VMs', submit: 'Delete Selected', callbackId: 'vm-delete-modal', privateMetaData: metaData })
    .blocks(
      Blocks.Section({ text: 'Select the VMs you want to delete:' }),
      Blocks.Input({ label: 'VMs to Delete', blockId: 'vms_to_delete' }).element(
        Elements.Checkboxes({ actionId: 'selected_vms' })
          .options(...options)
      )
    )
    .build();
}
