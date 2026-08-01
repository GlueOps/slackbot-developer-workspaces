import { Modal, Blocks, Elements, Bits } from 'slack-block-builder';

// Env vars are NOT entered on this modal — they come solely from a selected profile
// (managed via `/vm profile`; the recommended-keys guidance now lives in the profile-create
// modal). This modal only picks a profile; the merge happens in listeners/views/vm-create-modal.js.
export default function vmCreateModal({ regions = [], images = [], servers = [], metaData, vmCount = 1, selectedRegion = null, profiles = [], selectedProfile = null, selectedImage = null, selectedServer = null, descriptions = [], cloneRepos = [], singleClick = false } = {}) {
  const title = vmCount > 1 ? `Create ${vmCount} VMs` : 'Create VM';

  // Per-VM fields: each VM gets its own description and repo to clone (different VMs are
  // usually different repos). Region/image/size and any selected profile stay shared.
  // initialValue re-seeds anything the user already typed when the modal is rebuilt (e.g.
  // on region change), so switching regions doesn't wipe their input.
  const perVmBlocks = [];
  for (let i = 1; i <= vmCount; i++) {
    const descLabel = vmCount > 1 ? `VM ${i} Description` : 'VM Description';
    const repoLabel = vmCount > 1 ? `VM ${i} repository to clone (BETA)` : 'Git repository to clone (BETA)';
    perVmBlocks.push(
      Blocks.Input({ label: descLabel, blockId: `description_${i}`, optional: true }).element(
        Elements.TextInput({ actionId: `description_${i}` })
          .placeholder('A short description of the VM')
          .initialValue(descriptions[i - 1] || undefined)
          .maxLength(100)
      ),
      Blocks.Input({ label: repoLabel, blockId: `clone_repo_${i}`, optional: true }).element(
        Elements.TextInput({ actionId: `clone_repo_${i}` })
          .placeholder('owner/repo or https://github.com/owner/repo')
          .initialValue(cloneRepos[i - 1] || undefined)
          .maxLength(300)
      )
    );
  }

  return Modal({ title, submit: 'Submit', callbackId: 'vm-create-modal', privateMetaData: metaData })
    .blocks(
      // Optional profile picker — the ONLY way to inject env vars. Shown when the user has
      // saved profiles; selecting one applies its env vars on submit. No default selection;
      // never required (no profile = a plain VM with no injected env). When the user has no
      // profiles, a hint points them to `/vm profile new`.
      ...(profiles.length > 0
        ? [Blocks.Input({ label: 'Profile', blockId: 'profile', optional: true }).element(
            Elements.StaticSelect({ actionId: 'profile' })
              .placeholder('No profile')
              .options(profiles.map(name => Bits.Option({ text: name, value: name })))
              .initialOption(
                selectedProfile
                  ? Bits.Option({ text: selectedProfile, value: selectedProfile })
                  : undefined
              )
          )]
        : [Blocks.Context().elements(
            'No profiles yet — run `/vm profile new` to save environment variables (e.g. `GITHUB_TOKEN`) you can apply here.'
          )]),

      Blocks.Input({ label: 'Region', blockId: 'region' })
      .dispatchAction(true)
      .element(
        Elements.StaticSelect({ actionId: 'region' })
          .placeholder('Select a region')
          .options(
            regions.length > 0
              ? regions.map(region =>
                  Bits.Option({ text: region.region_name, value: region.region_name })
                )
              : [Bits.Option({ text: 'No regions available', value: 'placeholder' })]
          )
          .initialOption(
            selectedRegion
              ? Bits.Option({ text: selectedRegion, value: selectedRegion })
              : undefined
          )
      ),

      Blocks.Input({ label: 'Image', blockId: 'image' }).element(
        Elements.StaticSelect({ actionId: 'image' })
          .placeholder('Select an image')
          .options(
            images.length > 0
              ? images.map(img =>
                  Bits.Option({ text: img, value: img })
                )
              : [Bits.Option({ text: 'No images available', value: 'placeholder' })]
          )
          .initialOption(
            selectedImage && images.includes(selectedImage)
              ? Bits.Option({ text: selectedImage, value: selectedImage })
              : undefined
          )
      ),

      Blocks.Input({ label: 'Server Type', blockId: 'server' }).element(
        Elements.StaticSelect({ actionId: 'server' })
          .placeholder('Select a server type')
          .options(
            servers.length > 0
              // Spell the specs out from the payload — slot names are free-form
              // in Waggle, so the name alone can't be relied on to carry them.
              // The option VALUE stays the bare instance_type: it round-trips
              // to the provisioner as the slot identifier.
              ? servers.map(server => {
                  const specs = [server.vcpus, server.memory_mb, server.storage_mb].every(Number.isFinite)
                    ? ` (${server.vcpus} vCPU • ${Math.round(server.memory_mb / 1024)} GB RAM • ${Math.round(server.storage_mb / 1024)} GB disk)`
                    : '';
                  // Slack caps option text at 75 chars; prefer dropping the
                  // specs over a hard API error on a long slot name.
                  const label = `${server.instance_type}${specs}`;
                  return Bits.Option({
                    text: label.length <= 75 ? label : server.instance_type.slice(0, 75),
                    value: server.instance_type
                  });
                })
              // Keep value 'placeholder' — the submit handler rejects it with an inline error
              : [Bits.Option({
                  text: selectedRegion ? 'No server types available' : 'Select a region first',
                  value: 'placeholder'
                })]
          )
      ),

      // The provisioner only lists server types that can be placed right now, so an
      // empty list for a selected region means the region is at capacity.
      ...(selectedRegion && servers.length === 0
        ? [Blocks.Context().elements(
            `:warning: *${selectedRegion}* is at capacity — no server types can be placed right now. Try another region or check back later.`
          )]
        : []),

      ...perVmBlocks,

      Blocks.Input({ label: 'Launch Mode', blockId: 'launchMode', optional: true }).element(
        Elements.Checkboxes({ actionId: 'singleClickExperience' })
          .options(
            Bits.Option({
              text: 'Enable Single-Click Experience (BETA)',
              value: 'single_click_enabled',
              description: 'One-click access to your Cloud Development Environment (BETA)'
            })
          )
          .initialOptions(
            singleClick
              ? [Bits.Option({
                  text: 'Enable Single-Click Experience (BETA)',
                  value: 'single_click_enabled',
                  description: 'One-click access to your Cloud Development Environment (BETA)'
                })]
              : undefined
          )
      )
    )
    .build();
}
