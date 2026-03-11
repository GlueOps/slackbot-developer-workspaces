import libvirt from '../../util/libvirt/libvirt-server.js';

export default async function vmCreateModalCallback({ ack, view, body, client }) {
  await ack();

  const values = view.state.values;
  const selectedRegion = values.region.region.selected_option.value;
  const selectedImage = values.image.image.selected_option.value;
  const selectedServer = values.server.server.selected_option.value;
  const singleClickExperience = values.launchMode?.singleClickExperience?.selected_options?.some(
    opt => opt.value === 'single_click_enabled'
  ) ?? false;
  const metaData = JSON.parse(view.private_metadata);
  const vmCount = metaData.vmCount || 1;

  // Extract descriptions for each VM
  const descriptions = [];
  for (let i = 1; i <= vmCount; i++) {
    const blockId = `description_${i}`;
    const actionId = `description_${i}`;
    descriptions.push(values[blockId]?.[actionId]?.value || '');
  }

  if (vmCount === 1) {
    // Single VM creation (original behavior with description in feedback)
    libvirt.createServer({
      client, body, imageName: selectedImage, region: selectedRegion,
      instanceType: selectedServer, description: descriptions[0],
      singleClickExperience, ...metaData
    });
  } else {
    // Batch creation: create all VMs in parallel
    const results = await Promise.allSettled(
      descriptions.map(description =>
        libvirt.createServer({
          client, body, imageName: selectedImage, region: selectedRegion,
          instanceType: selectedServer, description,
          singleClickExperience, ...metaData
        })
      )
    );

    // Build summary
    const succeeded = [];
    const failed = [];
    for (const result of results) {
      if (result.status === 'fulfilled' && result.value?.success) {
        succeeded.push(result.value);
      } else if (result.status === 'fulfilled' && result.value) {
        failed.push(result.value);
      } else {
        failed.push({ serverName: 'unknown', description: 'No description' });
      }
    }

    const lines = [];
    lines.push(`*Batch VM Creation Complete: ${succeeded.length}/${vmCount} succeeded*`);
    for (const vm of succeeded) {
      lines.push(`✅ ${vm.serverName} — ${vm.description} — <${vm.accessUrl}|${vm.accessLabel}>`);
    }
    for (const vm of failed) {
      lines.push(`❌ ${vm.serverName} — Failed to create`);
    }

    await client.chat.postEphemeral({
      channel: metaData.channel_id,
      user: body.user.id,
      text: lines.join('\n')
    });
  }
}
