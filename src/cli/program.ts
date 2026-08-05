import { Command } from 'commander';

import { getPackageVersion } from '../utils/index.ts';
import { ExitCode } from '../errors/index.ts';
import { registerStartCommand } from './commands/start.ts';
import { registerValidateCommand } from './commands/validate.ts';

/**
 * Builds the root `opcua-server` Command — exported (not just executed) so tests can
 * build a fresh program per test and call `.parseAsync([...])` against fake argv
 * without spawning a real process. #37-40 register their commands here the same way
 * `start`/`validate` do below.
 */
export function createProgram(): Command {
    const program = new Command();

    program
        .name('opcua-server')
        .description('CLI for managing the OPC UA server')
        .addHelpText(
            'after',
            [
                '',
                'Examples:',
                '  $ opcua-server start',
                '  $ opcua-server validate devices.json',
                '  $ opcua-server --version',
                '',
            ].join('\n'),
        )
        .version(getPackageVersion(), '-V, --version', "output the CLI's version number");

    // Applies to the whole program, including subcommands: replaces commander's default
    // process.exit(1)-on-any-error with our own ExitCode mapping. --help/--version are
    // still a clean exit 0; every other commander-detected error (unknown command,
    // unknown option, missing required argument, a rejected --log-level/--port, etc.)
    // maps to ExitCode.VALIDATION_ERROR — invalid CLI usage is a validation failure.
    program.exitOverride((err) => {
        if (err.code === 'commander.helpDisplayed' || err.code === 'commander.version') {
            process.exit(ExitCode.SUCCESS);
        }
        process.exit(ExitCode.VALIDATION_ERROR);
    });

    registerStartCommand(program);
    registerValidateCommand(program);

    return program;
}
