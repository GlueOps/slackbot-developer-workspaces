import libvirt from '../../util/libvirt/libvirt-server.js';
import parseRepo from '../../util/parse-repo.js';
import { getProfile } from '../../util/profile-store.js';
import logger from '../../util/logger.js';

const log = logger();

export default async function vmCreateModalCallback({ ack, view, body, client }) {
  const values = view.state.values;
  const metaData = JSON.parse(view.private_metadata);
  const vmCount = metaData.vmCount || 1;

  // Validate region/image/server + per-VM repos BEFORE acking so problems surface as inline
  // modal errors (keyed by block_id) rather than being silently dropped.
  const errors = {};

  // Optional-chain every read: if this fires against a transient loading/error view (which
  // has none of these blocks), a bare `.selected_option.value` would throw before ack.
  const selectedRegion = values.region?.region?.selected_option?.value;
  const selectedImage = values.image?.image?.selected_option?.value;
  const selectedServer = values.server?.server?.selected_option?.value;
  // Guard both the placeholder options that appear when a list is empty ("Select a region
  // first", "No images available") and a missing selection from reaching the provisioner.
  if (!selectedRegion || selectedRegion === 'placeholder') errors.region = 'Please select a region.';
  if (!selectedImage || selectedImage === 'placeholder') errors.image = 'Please select an image.';
  if (!selectedServer || selectedServer === 'placeholder') errors.server = 'Please pick a server type (if none are listed, the region is at capacity — try another region).';

  // Extract per-VM description + repo. Repo is validated and normalised to a canonical
  // https://github.com/owner/repo.git URL; blank is allowed (optional).
  const descriptions = [];
  const cloneRepos = [];
  for (let i = 1; i <= vmCount; i++) {
    descriptions.push(values[`description_${i}`]?.[`description_${i}`]?.value || '');
    const { repo, error } = parseRepo(values[`clone_repo_${i}`]?.[`clone_repo_${i}`]?.value || '');
    if (error) errors[`clone_repo_${i}`] = error;
    cloneRepos.push(repo || null);
  }

  if (Object.keys(errors).length > 0) {
    await ack({ response_action: 'errors', errors });
    return;
  }

  await ack();

  const singleClickExperience = values.launchMode?.singleClickExperience?.selected_options?.some(
    opt => opt.value === 'single_click_enabled'
  ) ?? false;

  // Env vars come solely from the selected profile (the create modal has no env input). No
  // profile → a plain VM with no injected env. A selected profile that can't be loaded
  // ABORTS creation — we never create a VM that's silently missing the secrets the developer
  // selected. Invariant: VM created + profile selected ⟹ profile applied.
  const selectedProfile = values.profile?.profile?.selected_option?.value || null;
  let finalEnv = {};
  let profileName = null;
  if (selectedProfile) {
    let profile;
    try {
      const info = await client.users.info({ user: body.user.id });
      profile = await getProfile(info.user.profile.email, selectedProfile);
    } catch (err) {
      log.error('create: failed to load selected profile; aborting VM creation', err);
      await client.chat.postEphemeral({
        channel: metaData.channel_id,
        user: body.user.id,
        text: `❌ Couldn't load profile *${selectedProfile}* (storage error) — no VM was created. Please try again.`
      });
      return;
    }
    if (!profile?.env) {
      await client.chat.postEphemeral({
        channel: metaData.channel_id,
        user: body.user.id,
        text: `❌ Profile *${selectedProfile}* no longer exists — no VM was created.`
      });
      return;
    }
    finalEnv = profile.env;
    profileName = selectedProfile;
  }

  if (vmCount === 1) {
    // Single VM creation (original behavior with description in feedback)
    libvirt.createServer({
      client, body, imageName: selectedImage, region: selectedRegion,
      instanceType: selectedServer, description: descriptions[0],
      singleClickExperience, userEnv: finalEnv, cloneRepo: cloneRepos[0], profileName, ...metaData
    });
  } else {
    // Batch creation: create all VMs in parallel. Region/image/size/env are shared; each
    // VM gets its own description and repo.
    const results = await Promise.allSettled(
      descriptions.map((description, idx) =>
        libvirt.createServer({
          client, body, imageName: selectedImage, region: selectedRegion,
          instanceType: selectedServer, description,
          singleClickExperience, userEnv: finalEnv, cloneRepo: cloneRepos[idx], profileName,
          batch: true, ...metaData
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
    const titleProfile = profileName ? ` — profile: ${profileName}` : '';
    lines.push(`*Batch VM Creation Complete: ${succeeded.length}/${vmCount} succeeded*${titleProfile}`);
    for (const vm of succeeded) {
      lines.push(`✅ ${vm.serverName} — ${vm.description || 'No description'} — repo: ${vm.cloneRepo || 'None'} — <${vm.accessUrl}|${vm.accessLabel}>`);
    }
    for (const vm of failed) {
      // When the server name is known, show "name — description"; otherwise just the
      // description (avoid printing the same fallback text twice).
      const named = vm.serverName && vm.serverName !== 'unknown';
      const label = named ? `${vm.serverName} — ${vm.description || 'No description'}` : (vm.description || 'VM');
      lines.push(`❌ ${label} — Failed to create`);
    }

    await client.chat.postEphemeral({
      channel: metaData.channel_id,
      user: body.user.id,
      text: lines.join('\n')
    });
  }
}
