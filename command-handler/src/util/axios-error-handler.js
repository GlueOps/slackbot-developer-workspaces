export default function axiosError(e) {
    const errorObj = {
        data: e.respone ? e.response.data : null,
        status: e.response ? e.response.status : null,
        message: e.message,
        stackTrace: e.stack

    }
    return errorObj;
}