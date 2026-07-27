import parseEnvVars from '../../util/parse-env-vars.js';
import { saveProfile } from '../../util/profile-store.js';
import logger from '../../util/logger.js';

const log = logger();

// Handles submission of the create/update profile modal (callbackId 'vm-profile-modal').
// Validates name + env before acking so problems surface inline, then writes to S3.
export default async function vmProfileModalCallback({ ack, view, body, client }) {
  const values = view.state.values;
  const meta = JSON.parse(view.private_metadata || '{}');
  // When editing, the name is locked and carried in private_metadata (there's no name
  // input in the view). When creating, it comes from the input field.
  const editing = Boolean(meta.name);
  const name = (editing ? meta.name : (values.profile_name?.profile_name?.value || '')).trim();
  const envText = values.env_vars?.env_vars?.value || '';

  const { env, errors: envErrors } = parseEnvVars(envText);
  const errors = {};
  if (!editing && !name) errors.profile_name = 'Please enter a profile name.';
  if (envErrors.length > 0) errors.env_vars = envErrors.join('  •  ').slice(0, 1900);
  if (Object.keys(errors).length > 0) {
    await ack({ response_action: 'errors', errors });
    return;
  }
  await ack();

  const channel = meta.channel_id;

  let email;
  try {
    const info = await client.users.info({ user: body.user.id });
    email = info.user.profile.email;
  } catch (err) {
    log.error('profile save: failed to resolve user email', err);
    return;
  }

  try {
    await saveProfile(email, name, { env });
    if (channel) {
      await client.chat.postEphemeral({
        channel, user: body.user.id,
        text: `✅ Saved profile *${name}* (${Object.keys(env).length} environment variable${Object.keys(env).length === 1 ? '' : 's'}).`
      });
    }
  } catch (err) {
    log.error('profile save: failed to write to S3', err);
    if (channel) {
      await client.chat.postEphemeral({ channel, user: body.user.id, text: `❌ Failed to save profile *${name}*. Please try again.` });
    }
  }
}
