import libvirt from '../../util/libvirt/libvirt-server.js';

export default async function vmEditModalCallback({ ack, view, body, client }) {
  await ack();

  const values = view.state.values;
  const description = values.description.description.value;
  const metaData = JSON.parse(view.private_metadata);
  metaData.tags.description = description;

  libvirt.editServer({ client, body, ...metaData });
}
