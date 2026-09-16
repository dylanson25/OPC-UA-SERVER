import fs from 'node:fs';
import path from 'node:path';

import { Command } from 'commander';

import { ControlClient, getControlSocketPath, type ExportNodesetResult } from '../../control/index.ts';
import { ExitCode } from '../../errors/index.ts';
import { parseTargetPort, resolveTargetPort } from '../target-port.ts';
import { reportControlChannelFailure } from '../control-error.ts';

interface ExportNodesetOptions {
    port?: number;
    out?: string;
}

export function registerExportNodesetCommand(program: Command): void {
    program
        .command('export-nodeset')
        .description("Export the running server's address space as standard NodeSet2 XML")
        .option('--port <number>', 'Port of the running server to target', parseTargetPort)
        .option('--out <path>', 'Write the XML to this file instead of stdout')
        .addHelpText(
            'after',
            [
                '',
                'Examples:',
                '  $ opcua-server export-nodeset > nodeset2.xml',
                '  $ opcua-server export-nodeset --out ./nodeset2.xml',
                '  $ opcua-server export-nodeset --port 4880 --out ./nodeset2.xml',
                '',
            ].join('\n'),
        )
        .action(async (options: ExportNodesetOptions) => {
            const port = resolveTargetPort(options.port);
            const client = new ControlClient(getControlSocketPath(port));

            try {
                await client.connect();
            } catch (err) {
                reportControlChannelFailure(err, 'Could not reach the OPC UA server');
            }

            try {
                const result = await client.request<ExportNodesetResult>('export-nodeset');

                if (options.out) {
                    fs.mkdirSync(path.dirname(options.out), { recursive: true });
                    fs.writeFileSync(options.out, result.xml);
                    // stderr, not stdout: keeps stdout XML-only in the no-`--out` case,
                    // and this message consistent regardless of which mode was used.
                    console.error(`Wrote ${result.xml.length} bytes to ${options.out}`);
                } else {
                    // Raw write, not console.log: piping/redirecting to a file shouldn't
                    // pick up an extra trailing newline console.log would add.
                    process.stdout.write(result.xml);
                }

                process.exit(ExitCode.SUCCESS);
            } catch (err) {
                reportControlChannelFailure(err, 'Failed to export the address space');
            } finally {
                client.disconnect();
            }
        });
}
