export default function axiosError(e) {
    const errorObj = {
        data: e.response?.data ?? null,
        status: e.response?.status ?? null,
        message: e.message,
        stackTrace: e.stack

    }
    return errorObj;
}