export default function axiosError(e) {
    const errorObj = {
        data: e.response.data,
        status: e.response.status,
        stackTrace: e.stack

    }
    return errorObj;
}