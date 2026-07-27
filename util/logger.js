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
const redact = format((info) => redactSensitive(info));

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
