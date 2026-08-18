import { Command } from 'commander';

import {
    ControlClient,
    getControlSocketPath,
    type ResolvedTag,
    type TagChangeEvent,
    type TagSelector,
} from '../../control/index.ts';
import { ExitCode } from '../../errors/index.ts';
import { parseTargetPort, resolveTargetPort } from '../target-port.ts';
import { reportControlChannelFailure } from '../control-error.ts';
import { buildTagSelectorPayload, type TagSelectorCliOptions } from '../tag-selector.ts';
import { formatTagValue } from '../format-value.ts';
import { PINO_LOG_LEVELS, parseLogLevel } from '../log-levels.ts';

interface WatchOptions extends TagSelectorCliOptions {
    port?: number;
    logLevel?: string;
}

export function registerWatchCommand(program: Command): void {
    program
        .command('watch')
        .description('Stream real-time tag value changes for a device or tag (Ctrl+C to stop)')
        .option('--device <key>', 'Watch every tag on this device')
        .option('--node-id <id>', 'Watch a single tag by NodeId')
        .option('--browse-name <name>', 'Watch a single tag by BrowseName (combine with --device to disambiguate)')
        .option('--port <number>', 'Port of the running server to target', parseTargetPort)
        .option(
            '--log-level <level>',
            `At "trace", show every update instead of only significant changes (${PINO_LOG_LEVELS.join(', ')})`,
            parseLogLevel,
        )
        .addHelpText(
            'after',
            [
                '',
                'Examples:',
                '  $ opcua-server watch --device plc1',
                '  $ opcua-server watch --node-id "ns=2;s=PLC1.Temperature1"',
                '  $ opcua-server watch --browse-name Temperature1',
                '  $ opcua-server watch --browse-name Temperature1 --device plc1',
                '  $ opcua-server watch --device plc1 --log-level trace',
                '',
            ].join('\n'),
        )
        .action(async (options: WatchOptions) => {
            let selector: TagSelector;
            try {
                selector = buildTagSelectorPayload(options, { allowTags: false });
            } catch (err) {
                reportControlChannelFailure(err, 'Invalid selector options');
            }

            const port = resolveTargetPort(options.port);
            const client = new ControlClient(getControlSocketPath(port));

            try {
                await client.connect();
            } catch (err) {
                reportControlChannelFailure(err, 'Could not reach the OPC UA server');
            }

            let watched: ResolvedTag[];
            try {
                // Resolved up front — before opening the stream — so an unknown device,
                // missing tag, or ambiguous browse name fails fast with a clear message
                // instead of a `watch` that silently never prints anything.
                watched = await client.request<ResolvedTag[]>('tags.resolve', selector);
            } catch (err) {
                client.disconnect();
                reportControlChannelFailure(err, 'Failed to resolve tag selector');
            }

            const nodeIds = new Set(watched.map((tag) => tag.nodeId));
            const labelWidth = Math.max(...watched.map((tag) => `${tag.device}.${tag.browseName}`.length));
            const showEveryUpdate = options.logLevel === 'trace';

            const unsubscribe = client.subscribe('tag-updates', (data) => {
                const change = data as TagChangeEvent;
                if (!nodeIds.has(change.nodeId)) return;
                if (!showEveryUpdate && !change.significant) return;

                printChange(change, labelWidth);
            });

            const stop = (): void => {
                unsubscribe();
                client.disconnect();
            };

            // Ctrl+C: leave no open subscription/connection on the server (#40's clean
            // SIGINT requirement) — disconnecting the socket alone is enough, since
            // ControlServer's own 'close' handler already tears down that socket's
            // subscriptions (see src/control/control-server.ts), same as any other
            // dropped client.
            process.once('SIGINT', () => {
                stop();
                process.exit(ExitCode.SUCCESS);
            });

            // No further await: the process stays alive because of the open control
            // channel socket, not a pending promise — output is driven entirely by the
            // 'tag-updates' subscription callback above until SIGINT.
        });
}

function printChange(change: TagChangeEvent, labelWidth: number): void {
    const label = `${change.device}.${change.browseName}`;
    console.log(
        `[${formatWatchTimestamp(change.timestamp)}] ${label.padEnd(labelWidth)}    ` +
            `${formatTagValue(change.oldValue)} → ${formatTagValue(change.newValue)}`,
    );
}

/** `HH:MM:SS.mmm`, local time — matches the issue's `[12:04:31.201] ...` example. */
function formatWatchTimestamp(isoTimestamp: string): string {
    const date = new Date(isoTimestamp);
    const pad = (n: number, width = 2) => String(n).padStart(width, '0');
    return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`;
}
