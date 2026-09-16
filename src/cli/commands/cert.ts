import fs from 'node:fs';
import path from 'node:path';

import { Command } from 'commander';

import { ExitCode } from '../../errors/index.ts';
import { readCertificateSummary } from '../../utils/index.ts';

interface CertOptions {
    out?: string;
}

export function registerCertCommand(program: Command): void {
    program
        .command('cert')
        .description("Show this server's OPC UA certificate — where it lives and its details")
        .option('--out <path>', 'Also copy the certificate (public part only) to this path')
        .addHelpText(
            'after',
            [
                '',
                'Run this on the machine (or container/volume) that actually hosts the server —',
                'it reads the local certs/ folder (or CERTIFICATE_FILE), the same config `start`',
                'uses, not a running server over the network.',
                '',
                'Examples:',
                '  $ opcua-server cert',
                '  $ opcua-server cert --out ./server-cert.pem',
                '',
            ].join('\n'),
        )
        .action(async (options: CertOptions) => {
            // Dynamic import: consistent with validate.ts/start.ts — keeps the static CLI
            // import graph free of anything beyond option parsing until an action needs it.
            const { serverOptions } = await import('../../config/server-config.ts');
            const { certificateFile } = serverOptions;

            try {
                const summary = readCertificateSummary(certificateFile);

                if (!summary) {
                    console.log(`No certificate found yet at:\n  ${certificateFile}`);
                    console.log(
                        '\nIt will be generated automatically the first time the server starts ' +
                            '(`opcua-server start`) — or place your own certificate.pem/private_key.pem ' +
                            'there (or point CERTIFICATE_FILE/PRIVATE_KEY_FILE at your own files) first.',
                    );
                    process.exit(ExitCode.SUCCESS);
                }

                console.log(`Certificate: ${summary.path}`);
                console.log(`Subject:     ${summary.subject}`);
                console.log(`Valid from:  ${summary.notBefore.toISOString()}`);
                console.log(`Valid to:    ${summary.notAfter.toISOString()}`);

                if (options.out) {
                    fs.mkdirSync(path.dirname(options.out), { recursive: true });
                    fs.copyFileSync(certificateFile, options.out);
                    console.log(`\nCopied to ${options.out} — install it in your OPC UA client's trusted store.`);
                }

                process.exit(ExitCode.SUCCESS);
            } catch (err) {
                console.error(`Failed to read certificate: ${err instanceof Error ? err.message : String(err)}`);
                process.exit(ExitCode.UNKNOWN_ERROR);
            }
        });
}
