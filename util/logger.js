/*
    This file is responsible for creating a logger instance 
    using the winston library. It logs to the console, as 
    a JSON object.
*/

import { createLogger, format, transports } from 'winston';
import redactSensitive from './redact.js';

const { combine, timestamp, json, errors } = format;

// Strip secrets (decrypted profile values, keys, tokens, cloud-init user_data) from every
// log record before serialization — a single choke point so no call site can leak.
// redactSensitive returns a redacted COPY (it never mutates the caller's object), which
// drops winston's control symbols (LEVEL/MESSAGE/SPLAT) that Object.entries can't see — so
// copy them back onto the redacted record or the transport can't route/print it.
const redact = format((info) => {
    const out = redactSensitive(info);
    for (const sym of Object.getOwnPropertySymbols(info)) out[sym] = info[sym];
    return out;
});

export default function logger() {
    const logger = createLogger({
        format: combine(
            errors({ stack: true }), // serialize Error message + stack, not "{}"
            redact(),
            timestamp(),
            json()
        ),
        transports: [
          new transports.Console(),
        ]
    });

    return logger;
}
