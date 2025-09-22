import axios from 'axios';
import vmModal from '../../user-interface/modals/vm-create.js';

export default async function vmRegionCallback({ ack, body, client }) {
  await ack();

  const selectedRegion = body.actions[0].selected_option.value;

  let regionsRes, imagesRes;
  try {
    [regionsRes, imagesRes] = await Promise.all([
      axios.get(`${process.env.PROVISIONER_URL}/v1/regions`, {
        headers: { 'Authorization': `${process.env.PROVISIONER_API_TOKEN}` }
      }),
      axios.get(`${process.env.PROVISIONER_URL}/v1/get-images`)
    ]);
  } catch (error) {
    console.error('Error fetching regions/images in region callback:', error);
    return;
  }

  const regions = regionsRes.data || [];
  const images = imagesRes.data.images || [];
  const regionObj = regions.find(r => r.region_name === selectedRegion);
  const servers = regionObj ? regionObj.available_instance_types : [];

  // Update the modal in place
  await client.views.update({
    view_id: body.view.id,
    view: vmModal({ regions, images, servers })
  });
}
