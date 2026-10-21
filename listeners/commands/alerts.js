/*
    /alerts — pause and resume incident.io paging for one cluster (captain_domain).

        /alerts status <captain_domain>
        /alerts pause  <captain_domain>
        /alerts resume <captain_domain>
        /alerts paused                    list every paused cluster route

    Pausing turns off every alert route for the cluster: alerts still reach
    incident.io and show in its UI, but nothing pages or posts to Slack. There is no
    auto-resume — resume explicitly; util/alerts-reminder.js re-posts what is still
    paused every 2 hours.

    Anyone in the workspace can pause and resume. Every change is logged and, when
    ALERTS_AUDIT_CHANNEL_ID is set, announced there so the team can see who silenced
    what. Replies go through `respond` (the command's response_url), which works in any
    channel or DM, unlike chat.postEphemeral in a channel the bot isn't in.
*/
import logger from '../../util/logger.js';
import axiosError from '../../util/axios-error-handler.js';
import escapeMrkdwn from '../../util/escape-mrkdwn.js';
import {
    DOMAIN_PATTERN, incidentIoConfigured, apiErrorMessage, listRoutes, clusterRoutes, pausedRoutes, getRoute,
    toUpdatePayload, putRoute
} from '../../util/incident-io.js';

const log = logger();

// Bolt's respond() and chat.postMessage errors: log what failed, never the request
// (a response_url is a credential for that channel for 30 minutes).
const slackError = (error) => ({ message: error.message, status: error.statusCode ?? error.data?.error });

const routeLine = (r) => `${r.enabled ? ':large_green_circle: active' : ':double_vertical_bar: paused'}  ${escapeMrkdwn(r.name)}`;

// Slack may hand a bare domain over as a link: <http://a.b.com|a.b.com> or <http://a.b.com>.
const unwrapLink = (arg) => arg.replace(/^<(?:https?:\/\/)?([^|>]+)(?:\|([^>]+))?>$/, (_, url, label) => label ?? url);

export default {
    description: 'Pause or resume incident.io alerts for a cluster',

    run: async ({ event, app, respond, commandPrefix }) => {
        const reply = async (text) => {
            try {
                await respond({ response_type: 'ephemeral', text });
            } catch (error) {
                log.error('alerts: reply failed', slackError(error));
            }
        };
        const usage = `Usage: /${commandPrefix}alerts status|pause|resume &lt;captain_domain&gt;, or /${commandPrefix}alerts paused`;

        if (!incidentIoConfigured()) {
            await reply('The /alerts command is not configured (INCIDENT_IO_API_KEY is unset).');
            return;
        }

        const [rawSubcommand, rawDomain, ...extra] = event.text.trim().split(/\s+/);
        const subcommand = rawSubcommand.toLowerCase();
        const domain = rawDomain && unwrapLink(rawDomain).toLowerCase();
        // Once the first PUT is sent, a failure can no longer mean "nothing changed".
        let putsStarted = false;

        try {
            if (subcommand === 'paused' && !rawDomain) {
                const paused = pausedRoutes(await listRoutes());
                await reply(paused.length
                    ? `Paused alert routes:\n${paused.map(routeLine).join('\n')}`
                    : 'No alert routes are paused.');
                return;
            }

            if (!['status', 'pause', 'resume'].includes(subcommand) || !domain || extra.length || !DOMAIN_PATTERN.test(domain)) {
                await reply(usage);
                return;
            }

            const routes = clusterRoutes(await listRoutes(), domain);
            if (!routes.length) {
                await reply(`No incident.io alert routes found for \`${domain}\`. Check the captain_domain.`);
                return;
            }

            if (subcommand === 'status') {
                await reply(`Alert routes for \`${domain}\`:\n${routes.map(routeLine).join('\n')}`);
                return;
            }

            const enabled = subcommand === 'resume';
            const verb = enabled ? 'resumed' : 'paused';
            await reply(`${enabled ? 'Resuming' : 'Pausing'} alerts for \`${domain}\`…`);

            // Read and build every payload before changing anything, so a route the bot
            // can't rewrite fails the command up front instead of leaving it half done.
            const pending = [];
            const already = [];
            for (const { id } of routes) {
                const route = await getRoute(id);
                if (route.enabled === enabled) already.push(route.name);
                else pending.push({ id, name: route.name, payload: toUpdatePayload(route, enabled) });
            }

            const changed = [];
            const failed = [];
            putsStarted = true;
            for (const { id, name, payload } of pending) {
                try {
                    if (await putRoute(id, payload)) changed.push(name);
                    else already.push(name);
                } catch (error) {
                    log.error(`alerts: ${subcommand} of a route failed`, { user: event.user_id, domain, route: name, ...axiosError(error) });
                    failed.push({ name, reason: apiErrorMessage(error) });
                }
            }
            log.info(`alerts: ${verb}`, { user: event.user_id, domain, changed, failed: failed.map(f => f.name) });

            // Announce first: the audit trail must not depend on the reply getting through.
            // A failed attempt is announced too — a PUT that timed out can still land later.
            if ((changed.length || failed.length) && process.env.ALERTS_AUDIT_CHANNEL_ID) {
                const counts = [
                    changed.length && `${changed.length} route${changed.length === 1 ? '' : 's'}`,
                    failed.length && `${failed.length} failed, may still apply — check /${commandPrefix}alerts status ${domain}`,
                ].filter(Boolean).join(', ');
                const action = changed.length ? verb : `tried to ${subcommand}`;
                try {
                    await app.client.chat.postMessage({
                        channel: process.env.ALERTS_AUDIT_CHANNEL_ID,
                        text: `${enabled ? ':arrow_forward:' : ':double_vertical_bar:'} <@${event.user_id}> ${action} incident.io alerts for \`${domain}\` (${counts})`
                    });
                } catch (error) {
                    log.error('alerts: audit announcement failed', slackError(error));
                }
            }

            const lines = [];
            if (changed.length) lines.push(`Alerts ${verb} for \`${domain}\`:`, ...changed.map(n => `• ${escapeMrkdwn(n)}`));
            if (already.length) lines.push(`Already ${verb}:`, ...already.map(n => `• ${escapeMrkdwn(n)}`));
            if (failed.length) {
                lines.push(`Failed to ${subcommand}:`, ...failed.map(f => `• ${escapeMrkdwn(f.name)}: ${escapeMrkdwn(f.reason)}`),
                    `Run /${commandPrefix}alerts ${subcommand} ${domain} again to retry.`);
            }
            if (enabled && changed.length) {
                lines.push('Alerts that started while paused won\'t page now. Check the cluster\'s open alerts in incident.io.');
            }
            await reply(lines.join('\n'));
        } catch (error) {
            // axiosError() drops config.headers, which carries the incident.io API key.
            log.error(`alerts: ${subcommand} failed`, { user: event.user_id, domain, ...axiosError(error) });
            const outcome = putsStarted
                ? ` Some routes may have changed — run /${commandPrefix}alerts status ${domain}.`
                : ' Nothing was changed.';
            await reply(`/${commandPrefix}alerts ${subcommand} failed: ${escapeMrkdwn(apiErrorMessage(error))}.${outcome}`);
        }
    }
}
