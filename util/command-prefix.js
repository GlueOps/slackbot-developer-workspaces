/*
    The slash command prefix: '' in prod (/vm, /alerts), 'test-' elsewhere (/test-vm,
    /test-alerts), so nonprod can run alongside prod in the same workspace.

    Loads dotenv itself and reads APP_ENVIRONMENT per call, so it doesn't depend on
    which module happened to load .env first.
*/
import 'dotenv/config';

export default function commandPrefix() {
    return process.env.APP_ENVIRONMENT === 'prod' ? '' : 'test-';
}
