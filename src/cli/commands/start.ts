import { Command, InvalidArgumentError } from 'commander';

import { PINO_LOG_LEVELS, parseLogLevel } from '../log-levels.ts';

function parsePort(value: string): number {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65535) {
        throw new InvalidArgumentError(`Invalid port "${value}". Must be an integer between 1 and 65535.`);
    }
    return parsed;
}

interface StartOptions {
    config?: string;
    hostname?: string;
    port?: number;
    logLevel?: string;
}

/**
 * Applies CLI-flag overrides as environment variables — in memory only, never written
 * back to `.env` or any config file — before the rest of the app (server-config.ts,
 * logger.ts, config-reader.ts) reads process.env at import time. Since dotenv never
 * overrides an already-set process.env key, this gives "CLI > env var > default" for
 * free without touching any of that existing, tested config-reading code.
 */
function applyOverrides(options: StartOptions): void {
    if (options.config) process.env.DEVICES_CONFIG_PATH = options.config;
    if (options.hostname) process.env.HOSTNAME = options.hostname;
    if (options.port !== undefined) process.env.PORT = String(options.port);
    if (options.logLevel) process.env.LOG_LEVEL = options.logLevel;
}

export function registerStartCommand(program: Command): void {
    program
        .command('start')
        .description('Start the OPC UA server using the current configuration')
        .option('--config <path>', 'Load an alternative device configuration file')
        .option('--hostname <address>', 'Override the OPC UA server hostname')
        .option('--port <number>', 'Override the OPC UA endpoint port', parsePort)
        .option('--log-level <level>', `Override the log level (${PINO_LOG_LEVELS.join(', ')})`, parseLogLevel)
        .addHelpText(
            'after',
            [
                '',
                'Examples:',
                '  $ opcua-server start',
                '  $ opcua-server start --config ./configs/production.json',
                '  $ opcua-server start --hostname 192.168.0.150 --port 4880 --log-level debug',
                '  $ opcua-server start \\',
                '      --config ./configs/plc-line-1.json \\',
                '      --hostname 192.168.0.150 \\',
                '      --port 4880 \\',
                '      --log-level debug',
                '',
            ].join('\n'),
        )
        .action(async (options: StartOptions) => {
            applyOverrides(options);

            // Dynamic import: nothing under src/core (node-opcua, the address space, etc.)
            // gets loaded for commands that don't need it (--help, validate).
            const { startServer } = await import('../../server-runner.ts');
            startServer();
        });
}
