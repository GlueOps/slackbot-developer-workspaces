/*
    incident.io alert route client for the /alerts command: pause and resume paging
    for one cluster (captain_domain) by toggling `enabled` on its alert routes.

    Routes are found by NAME: every per-cluster route is named
    "<Source> · <captain_domain>". A route belongs to a cluster when its LAST " · "
    segment EQUALS the domain — never a substring match, since one domain can contain
    another (prod.example.com is inside nonprod.example.com). A last segment that isn't
    hostname-shaped (spaces, punctuation) is never treated as a cluster.

    Uses the v3 alert routes API (the one the OpenTofu provider uses). There is no
    PATCH, so a toggle is GET -> reshape into the update payload -> PUT.
*/
import axios from 'axios';
import 'dotenv/config';

const API_URL = 'https://api.incident.io';
const NAME_SEPARATOR = ' · ';
// The largest page the list endpoint accepts.
const PAGE_SIZE = 50;
// 10,000 routes; a cursor that keeps going past this is a bug, not a real org.
const MAX_PAGES = 200;
// How long to wait before a second look at a route whose PUT timed out or hit a 5xx:
// the change can land after the request gave up.
const SETTLE_MS = 3000;

// A bare hostname (dots optional — some captain_domains are single labels); rejects
// anything else before it is matched against route names or echoed back into Slack.
export const DOMAIN_PATTERN = /^[a-z0-9-]+(\.[a-z0-9-]+)*$/;

export const incidentIoConfigured = () => Boolean(process.env.INCIDENT_IO_API_KEY);

const client = () => axios.create({
    baseURL: API_URL,
    headers: { Authorization: `Bearer ${process.env.INCIDENT_IO_API_KEY}` },
    timeout: 1000 * 15
});

// The API's own explanation (e.g. why a PUT was rejected) when there is one, without a
// trailing period so it can be embedded in a sentence.
export const apiErrorMessage = (error) =>
    String(error.response?.data?.errors?.[0]?.message ?? error.message ?? error).replace(/\.+$/, '');

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Every route, walking the cursor until the API stops returning one. The list is
// slim: { id, name, enabled } per route. Deduplicated by id, in case a route shifts
// between pages while the list is walked.
export const listRoutes = async () => {
    const api = client();
    const routes = new Map();
    const seen = new Set();
    let after;
    for (let page = 0; page < MAX_PAGES; page++) {
        const res = await api.get('/v3/alert_routes', { params: { page_size: PAGE_SIZE, after } });
        for (const route of res.data?.alert_routes ?? []) routes.set(route.id, route);
        after = res.data?.pagination_meta?.after;
        if (!after) return [...routes.values()];
        // A cursor seen before would loop forever.
        if (seen.has(after)) throw new Error('incident.io returned a repeated page cursor');
        seen.add(after);
    }
    throw new Error(`incident.io returned more than ${MAX_PAGES} pages of alert routes`);
};

// The cluster a route belongs to, or null. Case and stray whitespace in a hand-made
// route name don't stop it matching.
const clusterDomain = (name) => {
    const segments = String(name ?? '').split(NAME_SEPARATOR);
    const last = segments[segments.length - 1].trim().toLowerCase();
    return segments.length > 1 && DOMAIN_PATTERN.test(last) ? last : null;
};

export const clusterRoutes = (routes, domain) =>
    routes.filter(r => clusterDomain(r.name) === domain);

// Cluster routes that are off — what /alerts paused and the reminder list.
export const pausedRoutes = (routes) =>
    routes.filter(r => !r.enabled && clusterDomain(r.name));

// Response -> payload shapes found anywhere in the route (route, per-source, message
// destinations, incident config, escalation targets), so walk the whole thing:
// - Conditions come back as { subject: {label, reference}, operation: {label, value} }
//   but are sent as plain strings.
// - A binding value is sent as { literal?, reference? }. The v3 spec declares nothing
//   else, but the provider notes alert routes read back decorated (label,
//   catalog_entry, ...) — it drops extras by decoding into typed structs; strip them
//   here. In a route, only binding values, condition subjects and grouping keys carry
//   `literal`/`reference`, and the latter two keep what they need.
const toPayloadShape = (node) => {
    if (Array.isArray(node)) return node.map(toPayloadShape);
    if (!node || typeof node !== 'object') return node;
    const out = {};
    for (const [k, v] of Object.entries(node)) out[k] = toPayloadShape(v);
    if (out.subject && typeof out.subject === 'object' && out.operation && typeof out.operation === 'object') {
        out.subject = out.subject.reference;
        out.operation = out.operation.value;
    }
    if ('literal' in out || 'reference' in out) {
        const value = {};
        if (out.literal !== undefined) value.literal = out.literal;
        if (out.reference !== undefined) value.reference = out.reference;
        return value;
    }
    return out;
};

// Whether a binding ({ value?, array_value? }) actually holds something. An empty
// binding object is truthy, so `if (binding)` isn't enough.
const hasBinding = (b) => Boolean(b?.value?.literal || b?.value?.reference || b?.array_value?.length);

// Response -> update payload, mirroring what the OpenTofu provider sends. Throws for
// a route it can't safely rewrite.
export const toUpdatePayload = (route, enabled) => {
    // Expressions carry read-only metadata (`returns`) that isn't reshaped here. The
    // cluster routes have none, so refuse rather than send an untested payload.
    if (route.expressions?.length) {
        throw new Error(`route "${route.name}" has expressions, which /alerts doesn't handle`);
    }
    const { id, created_at, updated_at, ...rest } = toPayloadShape(route);
    const payload = { ...rest, enabled, version: route.version + 1 };

    if (payload.escalation_config) {
        // A target is an escalation-path binding or a user binding, never both (the API
        // rejects both), but it echoes an escalation-path binding into `users` too. Send
        // back only the binding that holds a value.
        const escalation = {
            ...payload.escalation_config,
            escalation_targets: (payload.escalation_config.escalation_targets ?? []).map(t =>
                hasBinding(t.escalation_paths) ? { escalation_paths: t.escalation_paths }
                    : hasBinding(t.users) ? { users: t.users } : t),
        };
        // when_alert_joins_group is echoed as returned, grouping on or off: a team
        // preference can group the route's alerts, and the provider re-sends it the same
        // way. Its grace period only applies to on_each_new_alert — the API returns a 0
        // for other modes but rejects it when sent, so drop it there like the provider.
        const joins = escalation.when_alert_joins_group;
        if (joins && joins.mode !== 'on_each_new_alert' && 'grace_period_seconds' in joins) {
            const { grace_period_seconds, ...mode } = joins;
            escalation.when_alert_joins_group = mode;
        }
        payload.escalation_config = escalation;
    }

    // With grouping off the API rejects the grouping details (keys, window, AI), which
    // it may still return; the provider sends only `enabled` then.
    if (payload.grouping_config?.default && !payload.grouping_config.default.enabled) {
        payload.grouping_config = { ...payload.grouping_config, default: { enabled: false } };
    }

    // With incident creation off the API rejects the template and auto-decline fields
    // (the provider never sends them then).
    if (payload.incident_config?.enabled === false) {
        payload.incident_config = { enabled: false, condition_groups: payload.incident_config.condition_groups ?? [] };
    }
    return payload;
};

export const getRoute = async (routeId) =>
    (await client().get(`/v3/alert_routes/${routeId}`)).data.alert_route;

// PUT a payload from toUpdatePayload(). Returns true if this call changed the route,
// false if a concurrent edit already left it in the wanted state.
//
// A 2xx means this PUT applied (it carried the next version). If the response doesn't
// confirm the new state (an unexpected body), the route is re-read once to check.
//
// On a failed PUT the route is re-read. After a 4xx (e.g. 409, the version moved — a
// concurrent edit), a route already in the wanted state was changed by someone else.
// After a timeout or 5xx the PUT may have applied anyway — possibly a moment later, so
// it is re-read once more after SETTLE_MS — and a route in the wanted state counts as
// changed here and gets announced.
export const putRoute = async (routeId, payload) => {
    const inWantedState = async () => (await getRoute(routeId))?.enabled === payload.enabled;
    let res;
    try {
        res = await client().put(`/v3/alert_routes/${routeId}`, payload);
    } catch (error) {
        const status = error.response?.status;
        const mayHaveApplied = !status || status >= 500;
        try {
            if (await inWantedState()) return mayHaveApplied;
            if (mayHaveApplied) {
                await sleep(SETTLE_MS);
                if (await inWantedState()) return true;
            }
        } catch {
            // fall through: report the PUT's failure, not the re-read's
        }
        throw error;
    }
    if (res.data?.alert_route?.enabled === payload.enabled || await inWantedState()) return true;
    throw new Error(`update of route "${payload.name}" did not apply`);
};
