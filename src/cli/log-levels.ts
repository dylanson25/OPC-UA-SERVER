import { InvalidArgumentError } from 'commander';

/**
 * The levels supported by the project's pino setup (src/infrastructure/logger).
 * Shared across CLI commands (`start` now; #37-40 later) so `--log-level` is
 * validated identically everywhere.
 */
export const PINO_LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const;

export type PinoLogLevel = (typeof PINO_LOG_LEVELS)[number];

export function isPinoLogLevel(value: string): value is PinoLogLevel {
    return (PINO_LOG_LEVELS as readonly string[]).includes(value);
}

/** commander option-parser: throws InvalidArgumentError (caught by exitOverride) on a bad value. */
export function parseLogLevel(value: string): PinoLogLevel {
    if (!isPinoLogLevel(value)) {
        throw new InvalidArgumentError(
            `Invalid log level "${value}". Valid levels: ${PINO_LOG_LEVELS.join(', ')}.`,
        );
    }
    return value;
}
