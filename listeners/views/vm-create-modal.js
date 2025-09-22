import libvirt from '../../util/libvirt/libvirt-server.js';

export default async function vmCreateModalCallback({ ack, view, body, client }) {
  await ack();

  const values = view.state.values;
  const selectedRegion = values.region.region.selected_option.value;
  const selectedImage = values.image.image.selected_option.value;
  const selectedServer = values.server.server.selected_option.value;
  const description = values.description.description.value;

  libvirt.createServer({ client, body, imageName: selectedImage, region: selectedRegion, instanceType: selectedServer, description });
}
