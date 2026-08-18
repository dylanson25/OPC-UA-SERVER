import { Command, InvalidArgumentError } from 'commander';

import { ControlClient, getControlSocketPath, type InfoResult } from '../../control/index.ts';
import { ErrorCode, ExitCode, ServerError } from '../../errors/index.ts';
import { parseTargetPort, resolveTargetPort } from '../target-port.ts';
import { reportControlChannelFailure } from '../control-error.ts';
import { printInfo } from './info.ts';

// Deliberately short: this is meant to run every `--interval` from an orchestrator
// (see the Docker HEALTHCHECK example below), not to wait around for a slow server.
// connect() and request() apply this bound separately and run sequentially, so the
// worst case (an unresponsive server) is ~2x this value — kept well under Docker's
// own default HEALTHCHECK --timeout=5s. Configurable via --timeout either way.
const DEFAULT_HEALTHCHECK_TIMEOUT_MS = 2000;

// Only 'running' is healthy — 'degraded' (device in error state / recent error burst,
// see MetricsService.deriveStatus), 'starting', 'stopping', and 'stopped' are all
// signals a container orchestrator should act on. Mirrors the README's runtime-metrics
// guidance: "the signal a health check should treat as unhealthy alongside
// stopping/stopped/starting" — this command doesn't invent a separate health signal.
const HEALTHY_STATUSES: ReadonlySet<InfoResult['status']> = new Set(['running']);

interface HealthcheckOptions {
    port?: number;
    timeout?: number;
    verbose?: boolean;
}

/** commander option-parser for --timeout: a positive millisecond bound on the check. */
function parseTimeout(value: string): number {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed <= 0) {
        throw new InvalidArgumentError(`Invalid timeout "${value}". Must be a positive integer (milliseconds).`);
    }
    return parsed;
}

export function registerHealthcheckCommand(program: Command): void {
    program
        .command('healthcheck')
        .description('Check whether the running server is healthy (exit code only, by default)')
        .option('--port <number>', 'Port of the running server to target', parseTargetPort)
        .option(
            '--timeout <ms>',
            'Bounded timeout for the whole check, in milliseconds',
            parseTimeout,
            DEFAULT_HEALTHCHECK_TIMEOUT_MS,
        )
        .option('--verbose', 'Print the same status payload as `info` before exiting', false)
        .addHelpText(
            'after',
            [
                '',
                'Examples:',
                '  $ opcua-server healthcheck',
                '  $ opcua-server healthcheck --verbose',
                '  $ opcua-server healthcheck --port 4880 --timeout 2000',
                '',
                'Docker:',
                '  HEALTHCHECK --interval=30s --timeout=5s \\',
                '    CMD opcua-server healthcheck || exit 1',
                '',
            ].join('\n'),
        )
        .action(async (options: HealthcheckOptions) => {
            const port = resolveTargetPort(options.port);
            const timeoutMs = options.timeout ?? DEFAULT_HEALTHCHECK_TIMEOUT_MS;
            const client = new ControlClient(getControlSocketPath(port));

            try {
                await client.connect(timeoutMs);
            } catch (err) {
                reportControlChannelFailure(err, 'Could not reach the OPC UA server');
            }

            try {
                // Same request the `info` command makes — reuses that status/metrics data
                // source rather than defining a separate health signal (per the issue).
                const result = await client.request<InfoResult>('info', undefined, timeoutMs);

                if (options.verbose) printInfo(result);

                assertHealthy(result);
                process.exit(ExitCode.SUCCESS);
            } catch (err) {
                reportControlChannelFailure(err, 'Server reported an unhealthy status');
            } finally {
                client.disconnect();
            }
        });
}

function assertHealthy(info: InfoResult): void {
    if (HEALTHY_STATUSES.has(info.status)) return;

    throw new ServerError(
        ErrorCode.SERVER_UNHEALTHY,
        `Server is reachable but reports an unhealthy status: "${info.status}"`,
        { status: info.status },
    );
}
