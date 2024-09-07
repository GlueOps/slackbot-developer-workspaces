import axios from "axios"
import logger from "./logger.js"
import axiosError from "./axios-error-handler.js";

const log = logger();

export default async function getHetznerImages() {
    const images = await axios.get(`https://api.hetzner.cloud/v1/images?type=snapshot`, {
        headers: {
          'Authorization': `Bearer ${process.env.HETZNER_API_TOKEN}`
        }
    })
    .catch(error => {
    log.error('Failed to get images from hetzner', axiosError(error));
    });

    try {
        if (!Array.isArray(images)) {
            throw new Error('images is not an array');
        }
    } catch (error) {
        log.error({message: error.message, stack: error.stack});
        return null;
    }

    return images;
}