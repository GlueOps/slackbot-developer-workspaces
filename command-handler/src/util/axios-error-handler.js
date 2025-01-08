/*
    This function is used to handle errors that are thrown by axios requests.
    Since it is possible that the error object does not have a response object,
    we need to check if it exists before trying to access its properties.
    It handles that case by returning null if the response object does not exist.
*/

export default function axiosError(e) {
    const errorObj = {
        data: e.response?.data ?? null,
        status: e.response?.status ?? null,
        message: e.message,
        stackTrace: e.stack

    }
    return errorObj;
}