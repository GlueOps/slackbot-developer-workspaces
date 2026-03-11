import vmDeleteConfirmModal from '../../user-interface/modals/vm-delete-confirm.js';

export default async function vmDeleteModalCallback({ ack, view, body }) {
  const values = view.state.values;
  const selectedOptions = values.vms_to_delete?.selected_vms?.selected_options || [];

  if (selectedOptions.length === 0) {
    await ack({
      response_action: 'errors',
      errors: { vms_to_delete: 'Please select at least one VM to delete.' }
    });
    return;
  }

  const metaData = JSON.parse(view.private_metadata);

  // Build selected VMs list with full details for the confirmation modal
  const selectedVMs = selectedOptions.map(opt => {
    const parsed = JSON.parse(opt.value);
    // Extract description and created_at from the servers list in metadata
    const serverInfo = metaData.servers?.find(s => s.serverName === parsed.serverName) || {};
    return {
      serverName: parsed.serverName,
      region: parsed.region,
      description: serverInfo.tags?.description || 'No description',
      created_at: serverInfo.tags?.created_at || null
    };
  });

  const confirmMetaData = JSON.stringify({
    channel_id: metaData.channel_id,
    selectedVMs
  });

  await ack({
    response_action: 'push',
    view: vmDeleteConfirmModal({ selectedVMs, metaData: confirmMetaData })
  });
}
