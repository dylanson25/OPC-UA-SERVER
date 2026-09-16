import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockedCopyFileSync = vi.hoisted(() => vi.fn());
const mockedMkdirSync = vi.hoisted(() => vi.fn());
const mockedReadCertificateSummary = vi.hoisted(() => vi.fn());

vi.mock('node:fs', () => ({
    default: {
        copyFileSync: mockedCopyFileSync,
        mkdirSync: mockedMkdirSync,
    },
    copyFileSync: mockedCopyFileSync,
    mkdirSync: mockedMkdirSync,
}));

vi.mock('../../../src/utils/index.ts', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../../src/utils/index.ts')>();
    return {
        ...actual,
        readCertificateSummary: mockedReadCertificateSummary,
    };
});

vi.mock('../../../src/config/server-config.ts', () => ({
    serverOptions: {
        certificateFile: 'Z:\\fake\\certs\\certificate.pem',
        privateKeyFile: 'Z:\\fake\\certs\\private_key.pem',
    },
}));

import { createProgram } from '../../../src/cli/program.ts';
import { ExitCode } from '../../../src/errors/index.ts';
import { mockProcessExit, silenceCommanderOutput, ProcessExitSignal } from '../process-exit-helper.ts';

let exitSpy: ReturnType<typeof mockProcessExit>;
let logSpy: ReturnType<typeof vi.spyOn>;
let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
    mockedCopyFileSync.mockReset();
    mockedMkdirSync.mockReset();
    mockedReadCertificateSummary.mockReset();

    exitSpy = mockProcessExit();
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
    exitSpy.mockRestore();
    logSpy.mockRestore();
    errorSpy.mockRestore();
});

async function runCert(args: string[] = []): Promise<void> {
    const program = createProgram();
    silenceCommanderOutput(program);
    await program.parseAsync(['cert', ...args], { from: 'user' });
}

describe('cert command', () => {
    it('reports no certificate found yet, with the resolved path, and exits SUCCESS', async () => {
        mockedReadCertificateSummary.mockReturnValue(null);

        await expect(runCert()).rejects.toBeInstanceOf(ProcessExitSignal);

        expect(mockedReadCertificateSummary).toHaveBeenCalledWith('Z:\\fake\\certs\\certificate.pem');
        expect(exitSpy).toHaveBeenNthCalledWith(1, ExitCode.SUCCESS);
        const output = logSpy.mock.calls.map((call) => call[0]).join('\n');
        expect(output).toContain('Z:\\fake\\certs\\certificate.pem');
        expect(output).toContain('generated automatically');
    });

    it('prints the certificate path, subject, and validity when it exists', async () => {
        mockedReadCertificateSummary.mockReturnValue({
            path: 'Z:\\fake\\certs\\certificate.pem',
            subject: 'CN=NodeOPCUA@MYHOST',
            notBefore: new Date('2026-04-15T00:00:00.000Z'),
            notAfter: new Date('2036-04-12T00:00:00.000Z'),
        });

        await expect(runCert()).rejects.toBeInstanceOf(ProcessExitSignal);

        expect(exitSpy).toHaveBeenNthCalledWith(1, ExitCode.SUCCESS);
        const output = logSpy.mock.calls.map((call) => call[0]).join('\n');
        expect(output).toContain('Z:\\fake\\certs\\certificate.pem');
        expect(output).toContain('CN=NodeOPCUA@MYHOST');
        expect(output).toContain('2026-04-15T00:00:00.000Z');
        expect(output).toContain('2036-04-12T00:00:00.000Z');
        expect(mockedCopyFileSync).not.toHaveBeenCalled();
    });

    it('--out copies the certificate and creates the destination directory first', async () => {
        mockedReadCertificateSummary.mockReturnValue({
            path: 'Z:\\fake\\certs\\certificate.pem',
            subject: 'CN=X',
            notBefore: new Date('2026-01-01T00:00:00.000Z'),
            notAfter: new Date('2036-01-01T00:00:00.000Z'),
        });

        await expect(runCert(['--out', './out/server-cert.pem'])).rejects.toBeInstanceOf(ProcessExitSignal);

        expect(mockedMkdirSync).toHaveBeenCalledWith('./out', { recursive: true });
        expect(mockedCopyFileSync).toHaveBeenCalledWith('Z:\\fake\\certs\\certificate.pem', './out/server-cert.pem');
        expect(exitSpy).toHaveBeenNthCalledWith(1, ExitCode.SUCCESS);
        const output = logSpy.mock.calls.map((call) => call[0]).join('\n');
        expect(output).toContain('Copied to ./out/server-cert.pem');
    });

    it('exits ExitCode.UNKNOWN_ERROR and prints the failure when reading the certificate throws', async () => {
        mockedReadCertificateSummary.mockImplementation(() => {
            throw new Error('permission denied');
        });

        await expect(runCert()).rejects.toBeInstanceOf(ProcessExitSignal);

        expect(exitSpy).toHaveBeenNthCalledWith(1, ExitCode.UNKNOWN_ERROR);
        const output = errorSpy.mock.calls.map((call) => call[0]).join('\n');
        expect(output).toContain('permission denied');
    });
});
