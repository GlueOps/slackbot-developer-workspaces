import { Modal, Blocks, Elements, Bits } from 'slack-block-builder';

export default function vmCreateModal({ regions = [], images = [], servers = [], metaData, vmCount = 1, regionStats = null, selectedRegion = null, profiles = [], selectedProfile = null } = {}) {
  const title = vmCount > 1 ? `Create ${vmCount} VMs` : 'Create VM';

  const descriptionBlocks = [];
  for (let i = 1; i <= vmCount; i++) {
    const label = vmCount > 1 ? `VM ${i} Description` : 'VM Description';
    descriptionBlocks.push(
      Blocks.Input({ label, blockId: `description_${i}`, optional: true }).element(
        Elements.TextInput({ actionId: `description_${i}` })
          .placeholder('A short description of the VM')
          .maxLength(100)
      )
    );
  }

  return Modal({ title, submit: 'Submit', callbackId: 'vm-create-modal', privateMetaData: metaData })
    .blocks(
      // Optional profile picker — shown only when the user has saved profiles. Selecting
      // one applies its env vars on submit (merged under anything typed below). No default
      // selection; never required.
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
        : []),

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

      ...(regionStats != null
        ? [Blocks.Context().elements(
            `*Total:*       ${regionStats.total_vcpus} vCPU  •  ${regionStats.total_memory_gb}GB RAM  •  ${regionStats.total_storage_gb}GB Disk\n` +
            `*Unallocated:* ${regionStats.free_vcpus} vCPU  •  ${regionStats.free_memory_gb}GB RAM  •  ${regionStats.free_storage_gb}GB Disk\n` +
            `${regionStats.cpu_pct >= 91 ? '🔴' : regionStats.cpu_pct >= 50 ? '🟡' : '🟢'} *Current load:* ${regionStats.cpu_pct}% CPU  •  ${regionStats.ram_pct}% RAM`
          )]
        : []),

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
      ),

      Blocks.Input({ label: 'Server Type', blockId: 'server' }).element(
        Elements.StaticSelect({ actionId: 'server' })
          .placeholder('Select a server type')
          .options(
            servers.length > 0
              ? servers.map(server =>
                  Bits.Option({ text: server.instance_type, value: server.instance_type })
                )
              : [Bits.Option({ text: 'Select a region first', value: 'placeholder' })]
          )
      ),

      ...descriptionBlocks,

      Blocks.Input({ label: 'Git repository to clone', blockId: 'clone_repo', optional: true }).element(
        Elements.TextInput({ actionId: 'clone_repo' })
          .placeholder('owner/repo or https://github.com/owner/repo')
          .maxLength(300)
      ),

      Blocks.Input({ label: 'Environment variables', blockId: 'env_vars', optional: true }).element(
        Elements.TextInput({ actionId: 'env_vars' })
          .multiline(true)
          .placeholder('One per line, KEY=VALUE\nGITHUB_TOKEN=ghp_...\nDATABASE_URL=postgres://...')
          .maxLength(3000)
      ),

      Blocks.Input({ label: 'Launch Mode', blockId: 'launchMode', optional: true }).element(
        Elements.Checkboxes({ actionId: 'singleClickExperience' })
          .options(
            Bits.Option({ 
              text: 'Enable Single-Click Experience (BETA)', 
              value: 'single_click_enabled',
              description: 'One-click access to your Cloud Development Environment (BETA)'
            })
          )
      )
    )
    .build();
}
