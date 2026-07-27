import axios from 'axios';
import vmModal from '../../user-interface/modals/vm-create.js';

const MAX_VM_RAM_MB = 9216;

export default async function vmRegionCallback({ ack, body, client }) {
  await ack();

  const selectedRegion = body.actions[0].selected_option.value;
  const metaData = body.view.private_metadata;
  const parsedMetaData = JSON.parse(metaData);
  const vmCount = parsedMetaData.vmCount || 1;

  await client.views.update({
    view_id: body.view.id,
    view: {
      type: 'modal',
      callback_id: 'vm-create-modal',
      private_metadata: metaData,
      title: { type: 'plain_text', text: vmCount > 1 ? `Create ${vmCount} VMs` : 'Create VM' },
      submit: { type: 'plain_text', text: 'Submit' },
      blocks: [
        {
          type: 'section',
          text: { type: 'mrkdwn', text: `*Region:* ${selectedRegion}\n_Loading availability..._` }
        }
      ]
    }
  });

  let regionsRes, imagesRes;
  try {
    [regionsRes, imagesRes] = await Promise.all([
      axios.get(`${process.env.PROVISIONER_URL}/v1/regions`, {
        headers: { 'Authorization': `${process.env.PROVISIONER_API_TOKEN}` }
      }),
      axios.get(`${process.env.PROVISIONER_URL}/v1/get-images`)
    ]);
  } catch (error) {
    console.error('Error fetching regions/images in region callback:', error);
    await client.views.update({
      view_id: body.view.id,
      view: {
        type: 'modal',
        callback_id: 'vm-create-modal',
        private_metadata: metaData,
        title: { type: 'plain_text', text: vmCount > 1 ? `Create ${vmCount} VMs` : 'Create VM' },
        blocks: [
          { type: 'section', text: { type: 'mrkdwn', text: ':warning: Failed to load region data. Please close and try again.' } }
        ]
      }
    });
    return;
  }

  let regions = regionsRes.data || [];
  const images = imagesRes.data.images || [];

  // When creating multiple VMs, filter to regions that have small enough instance types
  if (vmCount > 1) {
    regions = regions.filter(r =>
      r.available_instance_types?.some(t => t.memory_mb <= MAX_VM_RAM_MB)
    );
  }

  const regionObj = regions.find(r => r.region_name === selectedRegion);
  let servers = regionObj ? regionObj.available_instance_types : [];
  const regionStats = regionObj != null && regionObj.cpu_pct != null
    ? {
        total_vcpus: regionObj.total_vcpus,
        total_memory_gb: regionObj.total_memory_gb,
        total_storage_gb: regionObj.total_storage_gb,
        free_vcpus: regionObj.free_vcpus,
        free_memory_gb: regionObj.free_memory_gb,
        free_storage_gb: regionObj.free_storage_gb,
        cpu_pct: regionObj.cpu_pct,
        ram_pct: regionObj.ram_pct,
      }
    : null;

  // When creating multiple VMs, filter instance types by RAM
  if (vmCount > 1) {
    servers = servers.filter(s => s.memory_mb <= MAX_VM_RAM_MB);
  }

  // Preserve everything the user already typed across the in-place rebuild — otherwise
  // switching regions silently wipes it. Profile names come from private_metadata; the
  // rest is read back from the current view state. Server Type is intentionally NOT
  // preserved (its options are region-specific).
  const st = body.view.state?.values || {};
  const profiles = parsedMetaData.profiles || [];
  const selectedProfile = st.profile?.profile?.selected_option?.value || null;
  const selectedImage = st.image?.image?.selected_option?.value || null;
  const envText = st.env_vars?.env_vars?.value || '';
  const singleClick = st.launchMode?.singleClickExperience?.selected_options?.some(
    o => o.value === 'single_click_enabled'
  ) ?? false;
  const descriptions = [];
  const cloneRepos = [];
  for (let i = 1; i <= vmCount; i++) {
    descriptions.push(st[`description_${i}`]?.[`description_${i}`]?.value || '');
    cloneRepos.push(st[`clone_repo_${i}`]?.[`clone_repo_${i}`]?.value || '');
  }

  // Update the modal in place
  await client.views.update({
    view_id: body.view.id,
    view: vmModal({
      regions, images, servers, metaData, vmCount, regionStats, selectedRegion,
      profiles, selectedProfile, selectedImage, descriptions, cloneRepos, envText, singleClick
    })
  });
}
