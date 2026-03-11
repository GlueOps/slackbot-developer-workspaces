import { Modal, Blocks } from 'slack-block-builder';
import { formatCreatedDate } from '../../util/format-date.js';

export default function vmDeleteConfirmModal({ selectedVMs = [], metaData } = {}) {
  const vmLines = selectedVMs.map(vm => {
    const createdDate = formatCreatedDate(vm.created_at);
    return `• *${vm.serverName}* — ${vm.description || 'No description'}\n   Created: ${createdDate}`;
  });

  return Modal({ title: 'Confirm Deletion', submit: 'Confirm Delete', callbackId: 'vm-delete-confirm-modal', privateMetaData: metaData })
    .blocks(
      Blocks.Section({ text: ':warning: *This action cannot be undone.* The following VMs will be permanently deleted:' }),
      Blocks.Divider(),
      Blocks.Section({ text: vmLines.join('\n\n') }),
      Blocks.Divider(),
      Blocks.Section({ text: `*${selectedVMs.length} VM${selectedVMs.length !== 1 ? 's' : ''}* will be deleted. Press *Confirm Delete* to proceed.` })
    )
    .build();
}
