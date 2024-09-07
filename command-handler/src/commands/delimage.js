import axios from "axios"
import logger from "../util/logger.js"
import getLatestTag from "../util/get-latest-tag.js"
import getHetznerImages from "../util/get-hetzner-images.js"

const log = logger();

export default {
    description: 'deletes outdated images from hetzner',

    run: async ({ response }) => {

        //get github tags
        const latestTag = await getLatestTag();

        //get hetzner images
        const images = await getHetznerImages();

        //return if no images
        if (!images) {
            app.client.chat.postEphemeral({
                channel: `${message.channel}`,
                user: `${message.user}`,
                text: `Failed to get image data`
            });
    
            return;
        }

        //get the image to delete
        for (const image of images) {
            if (image.description !== latestTag) {
                //delete the image that doesn't have the latest tag
                await axios.delete(`https://api.hetzner.cloud/v1/images/${image.id}`, {
                    headers: {
                    'Authorization': `Bearer ${process.env.HETZNER_API_TOKEN}`
                    }
                })
                .catch(error => {
                log.error('Failed to delete image from hetzner', axiosError(error));
                });
            }
        }
         
        response({
            text: `cleanup complete`
        })
    }
}