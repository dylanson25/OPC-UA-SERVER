import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockedConnect = vi.hoisted(() => vi.fn());
const mockedRequest = vi.hoisted(() => vi.fn());
const mockedDisconnect = vi.hoisted(() => vi.fn());
const mockedControlClientCtor = vi.hoisted(() => vi.fn());
const mockedWriteFileSync = vi.hoisted(() => vi.fn());
const mockedMkdirSync = vi.hoisted(() => vi.fn());

vi.mock('../../../src/control/index.ts', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../../src/control/index.ts')>();
    return {
        ...actual,
        ControlClient: mockedControlClientCtor,
    };
});

vi.mock('node:fs', () => ({
    default: {
        writeFileSync: mockedWriteFileSync,
        mkdirSync: mockedMkdirSync,
    },
    writeFileSync: mockedWriteFileSync,
    mkdirSync: mockedMkdirSync,
}));

import { createProgram } from '../../../src/cli/program.ts';
import { ExitCode, ErrorCode, ServerError } from '../../../src/errors/index.ts';
import { RemoteControlError } from '../../../src/control/index.ts';
import { mockProcessExit, silenceCommanderOutput, ProcessExitSignal } from '../process-exit-helper.ts';

let exitSpy: ReturnType<typeof mockProcessExit>;
let errorSpy: ReturnType<typeof vi.spyOn>;
let stdoutWriteSpy: ReturnType<typeof vi.spyOn>;

const sampleXml = '<UANodeSet xmlns="http://opcfoundation.org/UA/2011/03/UANodeSet.xsd"><Test/></UANodeSet>';

beforeEach(() => {
    mockedConnect.mockReset();
    mockedRequest.mockReset();
    mockedDisconnect.mockReset();
    mockedControlClientCtor.mockReset();
    mockedWriteFileSync.mockReset();
    mockedMkdirSync.mockReset();
    mockedControlClientCtor.mockImplementation(function (this: unknown, socketPath: string) {
        return { socketPath, connect: mockedConnect, request: mockedRequest, disconnect: mockedDisconnect };
    });

    exitSpy = mockProcessExit();
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    stdoutWriteSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
});

afterEach(() => {
    exitSpy.mockRestore();
    errorSpy.mockRestore();
    stdoutWriteSpy.mockRestore();
});

async function runExportNodeset(args: string[] = []): Promise<void> {
    const program = createProgram();
    silenceCommanderOutput(program);
    await program.parseAsync(['export-nodeset', ...args], { from: 'user' });
}

describe('export-nodeset command', () => {
    it('writes the XML raw to stdout (no trailing newline added) and exits SUCCESS', async () => {
        mockedConnect.mockResolvedValue(undefined);
        mockedRequest.mockResolvedValue({ xml: sampleXml });

        await expect(runExportNodeset()).rejects.toBeInstanceOf(ProcessExitSignal);

        expect(mockedRequest).toHaveBeenCalledWith('export-nodeset');
        expect(exitSpy).toHaveBeenNthCalledWith(1, ExitCode.SUCCESS);
        expect(stdoutWriteSpy).toHaveBeenCalledWith(sampleXml);
        expect(mockedWriteFileSync).not.toHaveBeenCalled();
        expect(mockedDisconnect).toHaveBeenCalledTimes(1);
    });

    it('--out writes the XML to a file instead of stdout, creating the destination directory first', async () => {
        mockedConnect.mockResolvedValue(undefined);
        mockedRequest.mockResolvedValue({ xml: sampleXml });

        await expect(runExportNodeset(['--out', './out/nodeset2.xml'])).rejects.toBeInstanceOf(ProcessExitSignal);

        expect(mockedMkdirSync).toHaveBeenCalledWith('./out', { recursive: true });
        expect(mockedWriteFileSync).toHaveBeenCalledWith('./out/nodeset2.xml', sampleXml);
        expect(stdoutWriteSpy).not.toHaveBeenCalled();
        expect(exitSpy).toHaveBeenNthCalledWith(1, ExitCode.SUCCESS);
        const output = errorSpy.mock.calls.map((call) => call[0]).join('\n');
        expect(output).toContain('Wrote');
        expect(output).toContain('./out/nodeset2.xml');
    });

    it('exits ExitCode.SERVER_ERROR quickly when the server is unreachable, without ever sending a request', async () => {
        mockedConnect.mockRejectedValue(
            new ServerError(ErrorCode.SERVER_NOT_RUNNING, 'No running OPC UA server was found'),
        );

        await expect(runExportNodeset()).rejects.toBeInstanceOf(ProcessExitSignal);

        expect(exitSpy).toHaveBeenNthCalledWith(1, ExitCode.SERVER_ERROR);
        expect(mockedRequest).not.toHaveBeenCalled();
    });

    it('exits with the categorized code the server reported on failure, and still disconnects', async () => {
        mockedConnect.mockResolvedValue(undefined);
        mockedRequest.mockRejectedValue(
            new RemoteControlError('UNKNOWN_ERROR', 'Address space not initialized', ExitCode.RUNTIME_ERROR),
        );

        await expect(runExportNodeset()).rejects.toBeInstanceOf(ProcessExitSignal);

        expect(exitSpy).toHaveBeenNthCalledWith(1, ExitCode.RUNTIME_ERROR);
        expect(mockedDisconnect).toHaveBeenCalledTimes(1);
    });

    it('targets the socket for the given --port', async () => {
        mockedConnect.mockResolvedValue(undefined);
        mockedRequest.mockResolvedValue({ xml: sampleXml });

        await expect(runExportNodeset(['--port', '4881'])).rejects.toBeInstanceOf(ProcessExitSignal);

        expect(mockedControlClientCtor).toHaveBeenCalledWith(expect.stringContaining('4881'));
    });
});
