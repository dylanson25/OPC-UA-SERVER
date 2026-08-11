import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockedConnect = vi.hoisted(() => vi.fn());
const mockedRequest = vi.hoisted(() => vi.fn());
const mockedDisconnect = vi.hoisted(() => vi.fn());
const mockedControlClientCtor = vi.hoisted(() => vi.fn());

vi.mock('../../../src/control/index.ts', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../../src/control/index.ts')>();
    return {
        ...actual,
        ControlClient: mockedControlClientCtor,
    };
});

import { createProgram } from '../../../src/cli/program.ts';
import { ExitCode } from '../../../src/errors/index.ts';
import { ErrorCode, ServerError } from '../../../src/errors/index.ts';
import { mockProcessExit, silenceCommanderOutput, ProcessExitSignal } from '../process-exit-helper.ts';

let exitSpy: ReturnType<typeof mockProcessExit>;
let logSpy: ReturnType<typeof vi.spyOn>;
let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
    mockedConnect.mockReset();
    mockedRequest.mockReset();
    mockedDisconnect.mockReset();
    mockedControlClientCtor.mockReset();
    mockedControlClientCtor.mockImplementation(function (this: unknown, socketPath: string) {
        return { socketPath, connect: mockedConnect, request: mockedRequest, disconnect: mockedDisconnect };
    });

    exitSpy = mockProcessExit();
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
    exitSpy.mockRestore();
    logSpy.mockRestore();
    errorSpy.mockRestore();
});

async function runInfo(args: string[] = []): Promise<void> {
    const program = createProgram();
    silenceCommanderOutput(program);
    await program.parseAsync(['info', ...args], { from: 'user' });
}

describe('info command', () => {
    it('prints version/status/devices/tags/sessions/uptime exactly per the issue example, and exits SUCCESS', async () => {
        mockedConnect.mockResolvedValue(undefined);
        mockedRequest.mockResolvedValue({
            version: '1.1.0',
            status: 'running',
            uptimeMs: (4 * 60 + 12) * 60_000,
            devices: 12,
            tags: 450,
            sessions: 3,
        });

        await expect(runInfo()).rejects.toBeInstanceOf(ProcessExitSignal);

        expect(exitSpy).toHaveBeenNthCalledWith(1, ExitCode.SUCCESS);
        expect(mockedRequest).toHaveBeenCalledWith('info');
        const lines = logSpy.mock.calls.map((call) => call[0]);
        expect(lines).toEqual([
            'OPC UA Server v1.1.0',
            'Status: running',
            'Devices: 12',
            'Tags: 450',
            'Sessions: 3',
            'Uptime: 4h 12m',
        ]);
        expect(mockedDisconnect).toHaveBeenCalledTimes(1);
    });

    it('exits ExitCode.SERVER_ERROR quickly when the server is unreachable, without ever sending a request', async () => {
        mockedConnect.mockRejectedValue(
            new ServerError(ErrorCode.SERVER_NOT_RUNNING, 'No running OPC UA server was found'),
        );

        await expect(runInfo()).rejects.toBeInstanceOf(ProcessExitSignal);

        expect(exitSpy).toHaveBeenNthCalledWith(1, ExitCode.SERVER_ERROR);
        expect(mockedRequest).not.toHaveBeenCalled();
        const output = errorSpy.mock.calls.map((call) => call[0]).join('\n');
        expect(output).toContain('SERVER_NOT_RUNNING');
    });

    it('targets the socket for the given --port', async () => {
        mockedConnect.mockResolvedValue(undefined);
        mockedRequest.mockResolvedValue({
            version: '1.0.0',
            status: 'running',
            uptimeMs: 0,
            devices: 0,
            tags: 0,
            sessions: 0,
        });

        await expect(runInfo(['--port', '4881'])).rejects.toBeInstanceOf(ProcessExitSignal);

        expect(mockedControlClientCtor).toHaveBeenCalledWith(expect.stringContaining('4881'));
    });
});
