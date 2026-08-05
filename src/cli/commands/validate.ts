import { Command } from 'commander';

import { ExitCode } from '../../errors/index.ts';

export function registerValidateCommand(program: Command): void {
    program
        .command('validate')
        .description('Validate a device configuration file without starting the server')
        .argument('<file>', 'Path to the devices.json-shaped file to validate')
        .addHelpText(
            'after',
            [
                '',
                'Examples:',
                '  $ opcua-server validate devices.json',
                '  $ opcua-server validate ./configs/production.json',
                '',
            ].join('\n'),
        )
        .action(async (file: string) => {
            // Dynamic import: config-reader.ts (like server-runner.ts in start.ts) pulls in
            // the shared pino logger, whose level is fixed at construction time. A static
            // import here would construct it before `start`'s action gets a chance to set
            // LOG_LEVEL from a CLI flag — this keeps the whole CLI's static import graph
            // (bin.ts -> program.ts -> commands/*) free of anything that touches it early.
            const { validateDevicesConfigFile } = await import('../../devices/config-reader.ts');
            const result = validateDevicesConfigFile(file);

            if (!result.ok) {
                // ValidationError's own message is already formatted as Path:/Reason: (see
                // ValidationError.fromZodError); ConfigurationError's is a plain sentence.
                // Either way, the error's own `code` + `message` is the complete report.
                console.error(`${result.error.code}\n\n${result.error.message}`);
                process.exit(result.error.exitCode);
            }

            const deviceCount = Object.keys(result.data).length;
            const tagCount = Object.values(result.data).reduce((sum, device) => sum + device.tags.length, 0);

            console.log(`✓ ${file} is valid — ${deviceCount} device(s), ${tagCount} tag(s).`);
            process.exit(ExitCode.SUCCESS);
        });
}
