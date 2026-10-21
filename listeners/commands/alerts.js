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
                log.error('alerts: reply failed', error);
            }
        };
        const usage = `Usage: /${commandPrefix}alerts status|pause|resume <captain_domain>, or /${commandPrefix}alerts paused`;

        if (!incidentIoConfigured()) {
            await reply('The /alerts command is not configured (INCIDENT_IO_API_KEY is unset).');
            return;
        }

        const [rawSubcommand, rawDomain, ...extra] = event.text.trim().split(/\s+/);
        const subcommand = rawSubcommand.toLowerCase();
        const domain = rawDomain && unwrapLink(rawDomain).toLowerCase();

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

            // Read and build every payload before changing anything, so a route the bot
            // can't rewrite fails the command up front instead of leaving it half done.
            const pending = [];
            for (const { id } of routes) {
                const route = await getRoute(id);
                if (route.enabled !== enabled) pending.push({ id, name: route.name, payload: toUpdatePayload(route, enabled) });
            }

            const changed = [];
            const failed = [];
            for (const { id, name, payload } of pending) {
                try {
                    if (await putRoute(id, payload)) changed.push(name);
                } catch (error) {
                    log.error(`alerts: ${subcommand} of a route failed`, { domain, route: name, ...axiosError(error) });
                    failed.push(`${escapeMrkdwn(name)}: ${escapeMrkdwn(apiErrorMessage(error))}`);
                }
            }
            log.info(`alerts: ${verb}`, { user: event.user_id, domain, changed, failed: failed.length });

            // Announce first: the audit trail must not depend on the reply getting through.
            if (changed.length && process.env.ALERTS_AUDIT_CHANNEL_ID) {
                try {
                    await app.client.chat.postMessage({
                        channel: process.env.ALERTS_AUDIT_CHANNEL_ID,
                        text: `${enabled ? ':arrow_forward:' : ':double_vertical_bar:'} <@${event.user_id}> ${verb} incident.io alerts for \`${domain}\` (${changed.length} route${changed.length === 1 ? '' : 's'}${failed.length ? `, ${failed.length} failed` : ''})`
                    });
                } catch (error) {
                    log.error('alerts: audit announcement failed', error);
                }
            }

            const lines = [];
            if (changed.length) lines.push(`Alerts ${verb} for \`${domain}\`:`, ...changed.map(n => `• ${escapeMrkdwn(n)}`));
            else if (!failed.length) lines.push(`Alerts for \`${domain}\` were already ${verb}.`);
            if (failed.length) {
                lines.push(`Failed to ${subcommand}:`, ...failed.map(f => `• ${f}`),
                    `Run /${commandPrefix}alerts ${subcommand} ${domain} again to retry.`);
            }
            if (enabled && changed.length) {
                lines.push('Alerts that started while paused won\'t page now. Check the cluster\'s open alerts in incident.io.');
            }
            await reply(lines.join('\n'));
        } catch (error) {
            // axiosError() drops config.headers, which carries the incident.io API key.
            log.error(`alerts: ${subcommand} failed`, { user: event.user_id, domain, ...axiosError(error) });
            await reply(`/${commandPrefix}alerts ${subcommand} failed: ${escapeMrkdwn(apiErrorMessage(error))}. Nothing was changed.`);
        }
    }
}
