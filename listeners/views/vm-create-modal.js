import libvirt from '../../util/libvirt/libvirt-server.js';
import parseEnvVars from '../../util/parse-env-vars.js';
import { getProfile } from '../../util/profile-store.js';
import logger from '../../util/logger.js';

const log = logger();

export default async function vmCreateModalCallback({ ack, view, body, client }) {
  const values = view.state.values;

  // Parse + validate user-supplied env vars BEFORE acking, so malformed lines can be
  // rejected with inline modal errors rather than silently dropped. Slack's `errors`
  // map is keyed by block_id and takes a single string, so we fold the per-line
  // messages into one (capped well under Slack's limit).
  const envText = values.env_vars?.env_vars?.value || '';
  const { env: userEnv, errors: envErrors } = parseEnvVars(envText);
  if (envErrors.length > 0) {
    await ack({
      response_action: 'errors',
      errors: { env_vars: envErrors.join('  •  ').slice(0, 1900) }
    });
    return;
  }

  await ack();

  const selectedRegion = values.region.region.selected_option.value;
  const selectedImage = values.image.image.selected_option.value;
  const selectedServer = values.server.server.selected_option.value;
  const singleClickExperience = values.launchMode?.singleClickExperience?.selected_options?.some(
    opt => opt.value === 'single_click_enabled'
  ) ?? false;

  // Repo to clone is per-create and never saved. Passed through as typed (owner/repo or
  // a URL); the codespaces image normalises + clones its default branch at boot.
  const cloneRepo = (values.clone_repo?.clone_repo?.value || '').trim() || null;

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
      singleClickExperience, userEnv: finalEnv, cloneRepo, profileName, ...metaData
    });
  } else {
    // Batch creation: create all VMs in parallel. Env vars + repo are entered once and
    // applied to every VM in the batch.
    const results = await Promise.allSettled(
      descriptions.map(description =>
        libvirt.createServer({
          client, body, imageName: selectedImage, region: selectedRegion,
          instanceType: selectedServer, description,
          singleClickExperience, userEnv: finalEnv, cloneRepo, profileName, ...metaData
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
