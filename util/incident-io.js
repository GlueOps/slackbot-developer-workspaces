/*
    incident.io alert route client for the /alerts command: pause and resume paging
    for one cluster (captain_domain) by toggling `enabled` on its alert routes.

    Routes are found by NAME: every per-cluster route is named
    "<Source> · <captain_domain>". A route belongs to a cluster when its LAST " · "
    segment EQUALS the domain — never a substring match, since one domain can contain
    another (prod.example.com is inside nonprod.example.com). A domain must contain a
    dot, so routes whose last segment is some other label are never treated as cluster
    routes.

    Uses the v3 alert routes API (the one the OpenTofu provider uses). There is no
    PATCH, so a toggle is GET -> reshape into the update payload -> PUT.
*/
import axios from 'axios';
import 'dotenv/config';

const API_URL = 'https://api.incident.io';
const NAME_SEPARATOR = ' · ';
// The largest page the list endpoint accepts.
const PAGE_SIZE = 50;

// A bare hostname with at least one dot; rejects anything else before it is matched
// against route names or echoed back into Slack.
export const DOMAIN_PATTERN = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/;

export const incidentIoConfigured = () => Boolean(process.env.INCIDENT_IO_API_KEY);

const client = () => axios.create({
    baseURL: API_URL,
    headers: { Authorization: `Bearer ${process.env.INCIDENT_IO_API_KEY}` },
    timeout: 1000 * 15
});

// The API's own explanation (e.g. why a PUT was rejected) when there is one.
export const apiErrorMessage = (error) =>
    String(error.response?.data?.errors?.[0]?.message ?? error.message ?? error);

// Every route, walking the cursor until the API stops returning one. The list is
// slim: { id, name, enabled } per route.
export const listRoutes = async () => {
    const api = client();
    const routes = [];
    const seen = new Set();
    let after;
    for (;;) {
        const res = await api.get('/v3/alert_routes', { params: { page_size: PAGE_SIZE, after } });
        routes.push(...(res.data?.alert_routes ?? []));
        after = res.data?.pagination_meta?.after;
        if (!after) return routes;
        // A cursor seen before would loop forever.
        if (seen.has(after)) throw new Error('incident.io returned a repeated page cursor');
        seen.add(after);
    }
};

const clusterDomain = (name) => {
    const segments = name.split(NAME_SEPARATOR);
    const last = segments[segments.length - 1];
    return segments.length > 1 && DOMAIN_PATTERN.test(last) ? last : null;
};

export const clusterRoutes = (routes, domain) =>
    routes.filter(r => clusterDomain(r.name) === domain);

// Cluster routes that are off — what /alerts paused and the reminder list.
export const pausedRoutes = (routes) =>
    routes.filter(r => !r.enabled && clusterDomain(r.name));

// Conditions come back as { subject: {label, reference}, operation: {label, value} }
// but are sent as plain strings. They appear in several places (route, per-source,
// message destinations, incident config), so walk the whole route.
const flattenConditions = (node) => {
    if (Array.isArray(node)) return node.map(flattenConditions);
    if (!node || typeof node !== 'object') return node;
    const out = {};
    for (const [k, v] of Object.entries(node)) out[k] = flattenConditions(v);
    if (out.subject && typeof out.subject === 'object' && out.operation && typeof out.operation === 'object') {
        out.subject = out.subject.reference;
        out.operation = out.operation.value;
    }
    return out;
};

// Response -> update payload, mirroring what the OpenTofu provider sends. Throws for
// a route it can't safely rewrite. Exported for testing.
export const toUpdatePayload = (route, enabled) => {
    // Expressions carry read-only metadata (`returns`) that isn't reshaped here. The
    // cluster routes have none, so refuse rather than send an untested payload.
    if (route.expressions?.length) {
        throw new Error(`route "${route.name}" has expressions, which /alerts doesn't handle`);
    }
    const { id, created_at, updated_at, ...rest } = flattenConditions(route);
    const payload = { ...rest, enabled, version: route.version + 1 };

    // when_alert_joins_group is echoed as returned, grouping on or off: a team preference
    // can group the route's alerts, and the provider re-sends it the same way.
    if (payload.escalation_config) {
        // A target is an escalation-path binding or a user binding, never both, but the
        // API echoes an escalation-path binding into `users` too. Send it back once.
        payload.escalation_config = {
            ...payload.escalation_config,
            escalation_targets: (payload.escalation_config.escalation_targets ?? []).map(t =>
                t.escalation_paths ? { escalation_paths: t.escalation_paths } : t),
        };
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
// When the outcome is unclear the route is re-read: after a 409 (the version moved — a
// concurrent edit) a route already in the wanted state was changed by someone else; after
// a timeout or 5xx the PUT may have been applied anyway, so a route in the wanted state
// counts as changed here and gets announced.
export const putRoute = async (routeId, payload) => {
    try {
        const res = await client().put(`/v3/alert_routes/${routeId}`, payload);
        if (res.data?.alert_route?.enabled !== payload.enabled) {
            throw new Error(`update of route "${payload.name}" did not apply`);
        }
        return true;
    } catch (error) {
        const status = error.response?.status;
        const mayHaveApplied = !status || status >= 500;
        if (status === 409 || mayHaveApplied) {
            let current;
            try {
                current = await getRoute(routeId);
            } catch {
                throw error; // report the PUT's failure, not the re-read's
            }
            if (current.enabled === payload.enabled) return mayHaveApplied;
        }
        throw error;
    }
};
