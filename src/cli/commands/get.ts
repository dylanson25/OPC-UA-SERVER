import { Command } from 'commander';

import { ControlClient, getControlSocketPath, type TagSelector, type TagValue } from '../../control/index.ts';
import { ExitCode } from '../../errors/index.ts';
import { parseTargetPort, resolveTargetPort } from '../target-port.ts';
import { reportControlChannelFailure } from '../control-error.ts';
import { buildTagSelectorPayload, type TagSelectorCliOptions } from '../tag-selector.ts';
import { formatTagValue } from '../format-value.ts';

interface GetOptions extends TagSelectorCliOptions {
    port?: number;
}

export function registerGetCommand(program: Command): void {
    program
        .command('get')
        .description('Read the current value of one or more tags once and exit')
        .option('--device <key>', 'Read every tag on this device (optionally narrowed by --tags)')
        .option('--node-id <id>', 'Read a single tag by NodeId')
        .option('--browse-name <name>', 'Read a single tag by BrowseName (combine with --device to disambiguate)')
        .option('--tags <list>', 'Comma-separated browse names, scoped to --device')
        .option('--port <number>', 'Port of the running server to target', parseTargetPort)
        .addHelpText(
            'after',
            [
                '',
                'Examples:',
                '  $ opcua-server get --device plc1',
                '  $ opcua-server get --node-id "ns=2;s=PLC1.Temperature1"',
                '  $ opcua-server get --browse-name Temperature1',
                '  $ opcua-server get --device plc1 --tags Temperature1,Temperature2',
                '',
            ].join('\n'),
        )
        .action(async (options: GetOptions) => {
            let selector: TagSelector;
            try {
                selector = buildTagSelectorPayload(options, { allowTags: true });
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

            try {
                const values = await client.request<TagValue[]>('tags.get', selector);
                printValues(values);
                process.exit(ExitCode.SUCCESS);
            } catch (err) {
                reportControlChannelFailure(err, 'Failed to read tag value(s)');
            } finally {
                client.disconnect();
            }
        });
}

function printValues(values: TagValue[]): void {
    const label = (tag: TagValue) => `${tag.device}.${tag.browseName}`;
    const width = Math.max(...values.map((tag) => label(tag).length));

    for (const tag of values) {
        console.log(`${label(tag).padEnd(width)}    ${formatTagValue(tag.value)}`);
    }
}
