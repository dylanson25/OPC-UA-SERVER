import path from "node:path";

import pino, { LoggerOptions } from "pino";

const isDev = process.env.NODE_ENV !== "production";
const logLevel = process.env.LOG_LEVEL || (isDev ? 'debug' : 'info');
const errorLogFile = path.join(process.cwd(), 'logs', 'errors.log');

const options: LoggerOptions = {
    level: logLevel,
    base: {
        service: 'opcua-server',
        env: process.env.NODE_ENV || 'development',
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: ['password', 'req.headers.authorization']
}

const transport = pino.transport({
    targets: [
        isDev
            ? {
                target: 'pino-pretty',
                level: logLevel,
                options: {
                    colorize: true,
                    translateTime: 'SYS:yyyy-mm-dd HH:MM:ss',
                    ignore: 'pid, hostname',
                    destination: 1,
                },
            }
            : {
                target: 'pino/file',
                level: logLevel,
                options: { destination: 1 },
            },
        {
            target: 'pino/file',
            level: 'error',
            options: { destination: errorLogFile, mkdir: true },
        },
    ],
});

export const logger = pino(options, transport);

export function createModuleLogger(module: import('./logger.types.ts').LogModule) {
    return logger.child({ module });
}