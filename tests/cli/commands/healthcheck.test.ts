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

const runningInfo = {
    version: '1.1.0',
    status: 'running' as const,
    uptimeMs: (4 * 60 + 12) * 60_000,
    devices: 12,
    tags: 450,
    sessions: 3,
};

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

async function runHealthcheck(args: string[] = []): Promise<void> {
    const program = createProgram();
    silenceCommanderOutput(program);
    await program.parseAsync(['healthcheck', ...args], { from: 'user' });
}

describe('healthcheck command', () => {
    it('exits ExitCode.SUCCESS and prints nothing when the server reports status "running"', async () => {
        mockedConnect.mockResolvedValue(undefined);
        mockedRequest.mockResolvedValue(runningInfo);

        await expect(runHealthcheck()).rejects.toBeInstanceOf(ProcessExitSignal);

        expect(exitSpy).toHaveBeenNthCalledWith(1, ExitCode.SUCCESS);
        expect(mockedRequest).toHaveBeenCalledWith('info', undefined, expect.any(Number));
        expect(logSpy).not.toHaveBeenCalled();
        expect(mockedDisconnect).toHaveBeenCalledTimes(1);
    });

    it('exits ExitCode.SERVER_ERROR quickly when the server is unreachable, without ever sending a request', async () => {
        mockedConnect.mockRejectedValue(
            new ServerError(ErrorCode.SERVER_NOT_RUNNING, 'No running OPC UA server was found'),
        );

        await expect(runHealthcheck()).rejects.toBeInstanceOf(ProcessExitSignal);

        expect(exitSpy).toHaveBeenNthCalledWith(1, ExitCode.SERVER_ERROR);
        expect(mockedRequest).not.toHaveBeenCalled();
        const output = errorSpy.mock.calls.map((call) => call[0]).join('\n');
        expect(output).toContain('SERVER_NOT_RUNNING');
    });

    it.each(['starting', 'degraded', 'stopping', 'stopped'] as const)(
        'exits ExitCode.SERVER_ERROR with SERVER_UNHEALTHY when reachable but status is "%s"',
        async (status) => {
            mockedConnect.mockResolvedValue(undefined);
            mockedRequest.mockResolvedValue({ ...runningInfo, status });

            await expect(runHealthcheck()).rejects.toBeInstanceOf(ProcessExitSignal);

            expect(exitSpy).toHaveBeenNthCalledWith(1, ExitCode.SERVER_ERROR);
            const output = errorSpy.mock.calls.map((call) => call[0]).join('\n');
            expect(output).toContain('SERVER_UNHEALTHY');
            expect(output).toContain(status);
            expect(mockedDisconnect).toHaveBeenCalledTimes(1);
        },
    );

    it('--verbose prints the same status payload as `info` when healthy', async () => {
        mockedConnect.mockResolvedValue(undefined);
        mockedRequest.mockResolvedValue(runningInfo);

        await expect(runHealthcheck(['--verbose'])).rejects.toBeInstanceOf(ProcessExitSignal);

        expect(exitSpy).toHaveBeenNthCalledWith(1, ExitCode.SUCCESS);
        const lines = logSpy.mock.calls.map((call) => call[0]);
        expect(lines).toEqual([
            'OPC UA Server v1.1.0',
            'Status: running',
            'Devices: 12',
            'Tags: 450',
            'Sessions: 3',
            'Uptime: 4h 12m',
        ]);
    });

    it('--verbose prints the payload before exiting non-zero when unhealthy', async () => {
        mockedConnect.mockResolvedValue(undefined);
        mockedRequest.mockResolvedValue({ ...runningInfo, status: 'degraded' });

        await expect(runHealthcheck(['--verbose'])).rejects.toBeInstanceOf(ProcessExitSignal);

        expect(exitSpy).toHaveBeenNthCalledWith(1, ExitCode.SERVER_ERROR);
        const lines = logSpy.mock.calls.map((call) => call[0]);
        expect(lines).toContain('Status: degraded');
    });

    it('without --verbose, prints nothing on success or failure (script-friendly)', async () => {
        mockedConnect.mockResolvedValue(undefined);
        mockedRequest.mockResolvedValue({ ...runningInfo, status: 'degraded' });

        await expect(runHealthcheck()).rejects.toBeInstanceOf(ProcessExitSignal);

        expect(logSpy).not.toHaveBeenCalled();
    });

    it('passes --timeout through to connect() and request() as the bound in milliseconds', async () => {
        mockedConnect.mockResolvedValue(undefined);
        mockedRequest.mockResolvedValue(runningInfo);

        await expect(runHealthcheck(['--timeout', '500'])).rejects.toBeInstanceOf(ProcessExitSignal);

        expect(mockedConnect).toHaveBeenCalledWith(500);
        expect(mockedRequest).toHaveBeenCalledWith('info', undefined, 500);
    });

    it('rejects a non-numeric/non-positive --timeout with ExitCode.VALIDATION_ERROR', async () => {
        await expect(runHealthcheck(['--timeout', '0'])).rejects.toBeInstanceOf(ProcessExitSignal);

        expect(exitSpy).toHaveBeenNthCalledWith(1, ExitCode.VALIDATION_ERROR);
        expect(mockedConnect).not.toHaveBeenCalled();
    });

    it('targets the socket for the given --port', async () => {
        mockedConnect.mockResolvedValue(undefined);
        mockedRequest.mockResolvedValue(runningInfo);

        await expect(runHealthcheck(['--port', '4881'])).rejects.toBeInstanceOf(ProcessExitSignal);

        expect(mockedControlClientCtor).toHaveBeenCalledWith(expect.stringContaining('4881'));
    });
});
