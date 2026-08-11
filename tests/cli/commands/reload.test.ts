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
import { RemoteControlError } from '../../../src/control/index.ts';
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

async function runReload(args: string[] = []): Promise<void> {
    const program = createProgram();
    silenceCommanderOutput(program);
    await program.parseAsync(['reload', ...args], { from: 'user' });
}

describe('reload command', () => {
    it('prints a device-change summary and exits ExitCode.SUCCESS on success', async () => {
        mockedConnect.mockResolvedValue(undefined);
        mockedRequest.mockResolvedValue({
            reloaded: true,
            deviceCount: 2,
            devices: [],
            added: ['PLC2'],
            removed: ['PLC-old'],
        });

        await expect(runReload()).rejects.toBeInstanceOf(ProcessExitSignal);

        expect(exitSpy).toHaveBeenNthCalledWith(1, ExitCode.SUCCESS);
        expect(mockedRequest).toHaveBeenCalledWith('reload');
        const output = logSpy.mock.calls.map((call) => call[0]).join('\n');
        expect(output).toContain('2 device(s)');
        expect(output).toContain('Added:   PLC2');
        expect(output).toContain('Removed: PLC-old');
        expect(mockedDisconnect).toHaveBeenCalledTimes(1);
    });

    it('reports "device set unchanged" when nothing was added or removed', async () => {
        mockedConnect.mockResolvedValue(undefined);
        mockedRequest.mockResolvedValue({ reloaded: true, deviceCount: 2, devices: [], added: [], removed: [] });

        await expect(runReload()).rejects.toBeInstanceOf(ProcessExitSignal);

        const output = logSpy.mock.calls.map((call) => call[0]).join('\n');
        expect(output).toContain('Device set unchanged');
    });

    it('exits with the exact categorized code the server reported on a failed reload', async () => {
        mockedConnect.mockResolvedValue(undefined);
        mockedRequest.mockRejectedValue(
            new RemoteControlError('DEVICE_CONFIG_INVALID', 'the new configuration is invalid', ExitCode.CONFIGURATION_ERROR),
        );

        await expect(runReload()).rejects.toBeInstanceOf(ProcessExitSignal);

        expect(exitSpy).toHaveBeenNthCalledWith(1, ExitCode.CONFIGURATION_ERROR);
        const output = errorSpy.mock.calls.map((call) => call[0]).join('\n');
        expect(output).toContain('DEVICE_CONFIG_INVALID');
    });

    it('exits ExitCode.SERVER_ERROR quickly when the server is unreachable, without ever sending a request', async () => {
        mockedConnect.mockRejectedValue(
            new ServerError(ErrorCode.SERVER_NOT_RUNNING, 'No running OPC UA server was found'),
        );

        await expect(runReload()).rejects.toBeInstanceOf(ProcessExitSignal);

        expect(exitSpy).toHaveBeenNthCalledWith(1, ExitCode.SERVER_ERROR);
        expect(mockedRequest).not.toHaveBeenCalled();
    });

    it('targets the socket for the given --port', async () => {
        mockedConnect.mockResolvedValue(undefined);
        mockedRequest.mockResolvedValue({ reloaded: true, deviceCount: 0, devices: [], added: [], removed: [] });

        await expect(runReload(['--port', '4880'])).rejects.toBeInstanceOf(ProcessExitSignal);

        expect(mockedControlClientCtor).toHaveBeenCalledWith(expect.stringContaining('4880'));
    });
});
