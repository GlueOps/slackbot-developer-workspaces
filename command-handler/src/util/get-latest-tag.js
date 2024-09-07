import axios from "axios"
import logger from "./logger.js"
import axiosError from "./axios-error-handler.js";

const log = logger();

export default async function getLatestTag() {
    const tags = await axios.get(`https://api.github.com/repos/glueops/packer-cloud-developer-environments/tags`, {
    })
    .catch(error => {
    log.error('Failed to get tags from github', axiosError(error));
    });

    if (tags.length > 0) {
    return tags[0].name;
    } else {
    return null;
    }
}