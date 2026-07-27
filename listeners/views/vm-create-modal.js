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

  // Extract per-VM description + repo to clone. Repo is per-create and never saved;
  // passed through as typed (owner/repo or URL) for the codespaces image to clone at boot.
  const descriptions = [];
  const cloneRepos = [];
  for (let i = 1; i <= vmCount; i++) {
    descriptions.push(values[`description_${i}`]?.[`description_${i}`]?.value || '');
    cloneRepos.push((values[`clone_repo_${i}`]?.[`clone_repo_${i}`]?.value || '').trim() || null);
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
          singleClickExperience, userEnv: finalEnv, cloneRepo: cloneRepos[idx], profileName, ...metaData
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
