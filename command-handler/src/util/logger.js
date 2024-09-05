import { createLogger, format, transports } from 'winston';

const { combine, timestamp, json } = format;

export default function logger() {
    const logger = createLogger({
        format: combine(
            timestamp(),
            json()
        ),
        transports: [
          new transports.Console(),
        ]
    });

    return logger;
}