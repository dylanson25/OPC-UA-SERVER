import { Command } from 'commander';

import { ControlClient, getControlSocketPath, type InfoResult } from '../../control/index.ts';
import { ExitCode } from '../../errors/index.ts';
import { parseTargetPort, resolveTargetPort } from '../target-port.ts';
import { reportControlChannelFailure } from '../control-error.ts';
import { formatUptime } from '../format-uptime.ts';

interface InfoOptions {
    port?: number;
}

export function registerInfoCommand(program: Command): void {
    program
        .command('info')
        .description('Display current server status and statistics')
        .option('--port <number>', 'Port of the running server to target', parseTargetPort)
        .addHelpText(
            'after',
            ['', 'Examples:', '  $ opcua-server info', '  $ opcua-server info --port 4880', ''].join('\n'),
        )
        .action(async (options: InfoOptions) => {
            const port = resolveTargetPort(options.port);
            const client = new ControlClient(getControlSocketPath(port));

            try {
                await client.connect();
            } catch (err) {
                reportControlChannelFailure(err, 'Could not reach the OPC UA server');
            }

            try {
                const result = await client.request<InfoResult>('info');
                printInfo(result);
                process.exit(ExitCode.SUCCESS);
            } catch (err) {
                reportControlChannelFailure(err, 'Failed to retrieve server info');
            } finally {
                client.disconnect();
            }
        });
}

/** Exported so `healthcheck` (#39) can print the identical payload for `--verbose`. */
export function printInfo(info: InfoResult): void {
    console.log(`OPC UA Server v${info.version}`);
    console.log(`Status: ${info.status}`);
    console.log(`Devices: ${info.devices}`);
    console.log(`Tags: ${info.tags}`);
    console.log(`Sessions: ${info.sessions}`);
    console.log(`Uptime: ${formatUptime(info.uptimeMs)}`);
}
