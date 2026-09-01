import { Command } from 'commander';

import { ControlClient, getControlSocketPath, type ReloadResult } from '../../control/index.ts';
import { ExitCode } from '../../errors/index.ts';
import { parseTargetPort, resolveTargetPort } from '../target-port.ts';
import { reportControlChannelFailure } from '../control-error.ts';

interface ReloadOptions {
    port?: number;
}

export function registerReloadCommand(program: Command): void {
    program
        .command('reload')
        .description('Trigger a device configuration reload on the running server')
        .option('--port <number>', 'Port of the running server to target', parseTargetPort)
        .addHelpText(
            'after',
            ['', 'Examples:', '  $ opcua-server reload', '  $ opcua-server reload --port 4880', ''].join('\n'),
        )
        .action(async (options: ReloadOptions) => {
            const port = resolveTargetPort(options.port);
            const client = new ControlClient(getControlSocketPath(port));

            try {
                await client.connect();
            } catch (err) {
                reportControlChannelFailure(err, 'Could not reach the OPC UA server');
            }

            try {
                const result = await client.request<ReloadResult>('reload');
                printSuccess(result);
                process.exit(ExitCode.SUCCESS);
            } catch (err) {
                reportControlChannelFailure(err, 'Reload failed');
            } finally {
                client.disconnect();
            }
        });
}

function printSuccess(result: ReloadResult): void {
    console.log(`✓ Configuration reloaded — ${result.deviceCount} device(s) active.`);

    if (result.added.length > 0) {
        console.log(`  Added:   ${result.added.join(', ')}`);
    }
    if (result.removed.length > 0) {
        console.log(`  Removed: ${result.removed.join(', ')}`);
    }
    if (result.added.length === 0 && result.removed.length === 0) {
        console.log('  Device set unchanged.');
    }
}
