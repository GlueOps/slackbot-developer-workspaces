/*
    Escapes text for Slack mrkdwn so names that come from other systems (e.g.
    incident.io route names) can't render as mentions or links.
*/

export default function escapeMrkdwn(text) {
    return String(text ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
