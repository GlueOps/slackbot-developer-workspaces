import libvirt from '../../util/libvirt/libvirt-server.js';
import parseEnvVars from '../../util/parse-env-vars.js';
import parseRepo from '../../util/parse-repo.js';
import { getProfile } from '../../util/profile-store.js';
import logger from '../../util/logger.js';

const log = logger();

export default async function vmCreateModalCallback({ ack, view, body, client }) {
  const values = view.state.values;
  const metaData = JSON.parse(view.private_metadata);
  const vmCount = metaData.vmCount || 1;

  // Validate env + per-VM repos BEFORE acking so problems surface as inline modal errors
  // (keyed by block_id) rather than being silently dropped.
  const errors = {};

  const selectedRegion = values.region.region.selected_option.value;
  const selectedImage = values.image.image.selected_option.value;
  const selectedServer = values.server.server.selected_option.value;
  // Guard the placeholder options that appear when a list is empty ("Select a region
  // first", "No images available") from being submitted to the provisioner.
  if (selectedRegion === 'placeholder') errors.region = 'Please select a region.';
  if (selectedImage === 'placeholder') errors.image = 'Please select an image.';
  if (selectedServer === 'placeholder') errors.server = 'Please pick a region first, then a server type.';

  const { env: userEnv, errors: envErrors } = parseEnvVars(values.env_vars?.env_vars?.value || '');
  if (envErrors.length > 0) errors.env_vars = envErrors.join('  •  ').slice(0, 1900);

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

  // If a profile was picked, merge its env under what the user typed (typed wins). Any
  // failure to load the profile degrades to "just the typed env" rather than blocking.
  const selectedProfile = values.profile?.profile?.selected_option?.value || null;
  let finalEnv = userEnv;
  let profileName = null;
  if (selectedProfile) {
    try {
      const info = await client.users.info({ user: body.user.id });
      const profile = await getProfile(info.user.profile.email, selectedProfile);
      if (profile?.env) {
        finalEnv = { ...profile.env, ...userEnv };
        profileName = selectedProfile;
      }
    } catch (err) {
      log.error('create: failed to apply profile, continuing with typed env only', err);
    }
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
      const label = vm.serverName && vm.serverName !== 'unknown' ? vm.serverName : (vm.description || 'VM');
      lines.push(`❌ ${label} — ${vm.description || 'No description'} — Failed to create`);
    }

    await client.chat.postEphemeral({
      channel: metaData.channel_id,
      user: body.user.id,
      text: lines.join('\n')
    });
  }
}
