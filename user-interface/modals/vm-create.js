import { Modal, Blocks, Elements, Bits } from 'slack-block-builder';

export default function vmCreateModal({ regions = [], images = [], servers = [], metaData } = {}) {
  return Modal({ title: 'Create VM', submit: 'Submit', callbackId: 'vm-create-modal', privateMetaData: metaData })
    .blocks(
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

      Blocks.Input({ label: 'VM Description', blockId: 'description', optional: true }).element(
        Elements.TextInput({ actionId: 'description' })
          .placeholder('A short description of the VM')
          .maxLength(100)
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
