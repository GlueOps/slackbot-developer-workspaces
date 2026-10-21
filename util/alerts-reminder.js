/*
    Every 2 hours, remind ALERTS_AUDIT_CHANNEL_ID about cluster alert routes that are
    still paused, so a forgotten /alerts pause doesn't silently stay off.

    Stateless: each run asks incident.io what is paused right now, so a bot restart
    can't lose track of a pause. The first run is a minute after startup, so a bot that
    restarts more often than every 2 hours still reminds. Posts nothing when no routes
    are paused. Every running instance with the key and channel set will remind, so
    enable it on one deployment.
*/
import logger from './logger.js';
import axiosError from './axios-error-handler.js';
import { incidentIoConfigured, listRoutes, pausedRoutes, getRoute } from './incident-io.js';
import escapeMrkdwn from './escape-mrkdwn.js';

const log = logger();

const REMINDER_INTERVAL_MS = 1000 * 60 * 60 * 2;
const FIRST_REMINDER_DELAY_MS = 1000 * 60;
const commandPrefix = process.env.APP_ENVIRONMENT === 'prod' ? '' : 'test-';

// Slack renders this in each reader's timezone; the fallback is for clients that can't.
const slackDate = (iso) => {
    const ts = Math.floor(Date.parse(iso) / 1000);
    return Number.isFinite(ts) ? `<!date^${ts}^{date_short_pretty} {time}|${iso}>` : 'unknown';
};

export const remindPausedAlerts = async (app) => {
    const paused = pausedRoutes(await listRoutes());
    if (!paused.length) return;

    // updated_at is when the route last changed — for a paused route, normally the
    // pause. A failed lookup only loses that route's time, not the whole reminder.
    const details = await Promise.allSettled(paused.map(r => getRoute(r.id)));
    const lines = paused.map((r, i) => {
        const since = details[i].status === 'fulfilled' ? slackDate(details[i].value.updated_at) : 'unknown';
        return `• ${escapeMrkdwn(r.name)} (since ${since})`;
    });

    await app.client.chat.postMessage({
        channel: process.env.ALERTS_AUDIT_CHANNEL_ID,
        text: `:double_vertical_bar: Reminder: incident.io alerts are still paused for:\n${lines.join('\n')}\nResume with /${commandPrefix}alerts resume <captain_domain>.`
    });
};

export default function startAlertsReminder(app) {
    if (!incidentIoConfigured() || !process.env.ALERTS_AUDIT_CHANNEL_ID) {
        log.info('alerts: paused reminder off (needs INCIDENT_IO_API_KEY and ALERTS_AUDIT_CHANNEL_ID)');
        return;
    }

    const remind = () => remindPausedAlerts(app).catch((error) => {
        // axiosError() drops config.headers, which carries the incident.io API key.
        log.error('alerts: paused reminder failed', axiosError(error));
    });
    setTimeout(remind, FIRST_REMINDER_DELAY_MS);
    setInterval(remind, REMINDER_INTERVAL_MS);
    log.info('alerts: paused reminder on, every 2 hours');
}
