import pino, { LoggerOptions } from "pino";

const isDev = process.env.NODE_ENV !== "production";

const options: LoggerOptions = {
    level: process.env.LOG_LEVEL || (isDev ? 'debug' : 'info'),
    transport: isDev ? {
        target: 'pino-pretty',
        options: {
            colorize: true,
            translateTime: 'SYS:yyyy-mm-dd HH:MM:ss',
            ignore: 'pid, hostname'
        },
    } : undefined,
    base: {
        service: 'opcua-server',
        env: process.env.NODE_ENV || 'development',
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: ['password', 'req.headers.authorization']
}

export const logger = pino(options);

export function createModuleLogger(module: import('./logger.types.ts').LogModule) {
    return logger.child({ module });
}