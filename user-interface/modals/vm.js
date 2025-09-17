import { Modal, Blocks, Elements, Bits } from 'slack-block-builder';

export default function vmModal({ regions = [], images = [], servers = [] } = {}) {
  return Modal({ title: 'Create VM', submit: 'Submit', callbackId: 'vm-modal' })
    .blocks(

      Blocks.Section({ blockId: 'region' })
        .text('*Region*')
        .accessory(
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
      )
    )
    .build();
}
