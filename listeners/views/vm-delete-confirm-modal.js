import axios from 'axios';
import logger from '../../util/logger.js';
import axiosError from '../../util/axios-error-handler.js';
import 'dotenv/config';

const log = logger('vm-delete-confirm');

export default async function vmDeleteConfirmModalCallback({ ack, view, body, client }) {
  await ack();

  const metaData = JSON.parse(view.private_metadata);
  const { channel_id, selectedVMs } = metaData;

  const results = await Promise.allSettled(
    selectedVMs.map(async (vm) => {
      await axios.delete(`${process.env.PROVISIONER_URL}/v1/delete`, {
        data: { "vm_name": vm.serverName, "region_name": vm.region },
        headers: { 'Authorization': `${process.env.PROVISIONER_API_TOKEN}` },
        timeout: 1000 * 60 * 2
      });
      return vm;
    })
  );

  const lines = [];
  lines.push(`*Batch VM Deletion Complete: ${selectedVMs.length} VM${selectedVMs.length !== 1 ? 's' : ''} processed*`);
  for (let i = 0; i < results.length; i++) {
    const vm = selectedVMs[i];
    if (results[i].status === 'fulfilled') {
      lines.push(`✅ ${vm.serverName} — Deleted`);
    } else {
      log.error(`Failed to delete ${vm.serverName}`, axiosError(results[i].reason));
      lines.push(`❌ ${vm.serverName} — Failed to delete`);
    }
  }

  await client.chat.postEphemeral({
    channel: channel_id,
    user: body.user.id,
    text: lines.join('\n')
  });
}
