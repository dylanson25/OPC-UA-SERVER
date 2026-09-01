import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockedConnect = vi.hoisted(() => vi.fn());
const mockedRequest = vi.hoisted(() => vi.fn());
const mockedDisconnect = vi.hoisted(() => vi.fn());
const mockedSubscribe = vi.hoisted(() => vi.fn());
const mockedUnsubscribe = vi.hoisted(() => vi.fn());
const mockedControlClientCtor = vi.hoisted(() => vi.fn());

vi.mock('../../../src/control/index.ts', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../../src/control/index.ts')>();
    return {
        ...actual,
        ControlClient: mockedControlClientCtor,
    };
});

import { createProgram } from '../../../src/cli/program.ts';
import { ExitCode, ErrorCode, ServerError } from '../../../src/errors/index.ts';
import { RemoteControlError } from '../../../src/control/index.ts';
import { mockProcessExit, silenceCommanderOutput, ProcessExitSignal } from '../process-exit-helper.ts';

let exitSpy: ReturnType<typeof mockProcessExit>;
let logSpy: ReturnType<typeof vi.spyOn>;
let errorSpy: ReturnType<typeof vi.spyOn>;
let onceSpy: ReturnType<typeof vi.spyOn>;
let subscribedHandler: ((data: unknown) => void) | undefined;
let sigintHandler: (() => void) | undefined;

beforeEach(() => {
    mockedConnect.mockReset();
    mockedRequest.mockReset();
    mockedDisconnect.mockReset();
    mockedSubscribe.mockReset();
    mockedUnsubscribe.mockReset();
    mockedControlClientCtor.mockReset();
    subscribedHandler = undefined;
    sigintHandler = undefined;

    mockedSubscribe.mockImplementation((_channel: string, handler: (data: unknown) => void) => {
        subscribedHandler = handler;
        return mockedUnsubscribe;
    });

    mockedControlClientCtor.mockImplementation(function (this: unknown, socketPath: string) {
        return {
            socketPath,
            connect: mockedConnect,
            request: mockedRequest,
            subscribe: mockedSubscribe,
            disconnect: mockedDisconnect,
        };
    });

    exitSpy = mockProcessExit();
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // Captures watch's `process.once('SIGINT', ...)` handler without actually
    // registering it on the real process — a plain `process.emit('SIGINT')` would
    // also invoke any *other* SIGINT listener already attached to this test process
    // (Vitest's own, node-opcua's, etc.), making the test both non-deterministic and
    // liable to trip other listeners' side effects. Calling the captured handler
    // directly tests exactly (and only) what watch.ts registered.
    onceSpy = vi.spyOn(process, 'once').mockImplementation(((event: string, handler: (...args: unknown[]) => void) => {
        if (event === 'SIGINT') sigintHandler = handler as () => void;
        return process;
    }) as typeof process.once);
});

afterEach(() => {
    exitSpy.mockRestore();
    logSpy.mockRestore();
    errorSpy.mockRestore();
    onceSpy.mockRestore();
});

async function runWatch(args: string[] = []): Promise<void> {
    const program = createProgram();
    silenceCommanderOutput(program);
    await program.parseAsync(['watch', ...args], { from: 'user' });
}

const temperatureTag = {
    device: 'PLC1',
    deviceName: 'PLC 1',
    browseName: 'Temperature1',
    nodeId: 'ns=2;s=PLC1.Temperature1',
    type: 'float',
};

describe('watch command', () => {
    it('resolves the selector, subscribes to tag-updates, and keeps running (no exit) once set up', async () => {
        mockedConnect.mockResolvedValue(undefined);
        mockedRequest.mockResolvedValue([temperatureTag]);

        await runWatch(['--node-id', temperatureTag.nodeId]);

        expect(mockedRequest).toHaveBeenCalledWith('tags.resolve', {
            device: undefined,
            nodeId: temperatureTag.nodeId,
            browseName: undefined,
            tags: undefined,
        });
        expect(mockedSubscribe).toHaveBeenCalledWith('tag-updates', expect.any(Function));
        expect(exitSpy).not.toHaveBeenCalled();
    });

    it('prints a significant change matching the watched nodeId, formatted "[time] label old → new"', async () => {
        mockedConnect.mockResolvedValue(undefined);
        mockedRequest.mockResolvedValue([temperatureTag]);

        await runWatch(['--node-id', temperatureTag.nodeId]);

        subscribedHandler?.({
            ...temperatureTag,
            oldValue: 72.4,
            newValue: 72.6,
            significant: true,
            timestamp: '2026-01-01T12:04:31.201Z',
        });

        expect(logSpy).toHaveBeenCalledTimes(1);
        const line = logSpy.mock.calls[0][0] as string;
        expect(line).toMatch(/^\[\d{2}:\d{2}:\d{2}\.\d{3}\] PLC1\.Temperature1\s+72\.4 → 72\.6$/);
    });

    it('does not print an insignificant change by default', async () => {
        mockedConnect.mockResolvedValue(undefined);
        mockedRequest.mockResolvedValue([temperatureTag]);

        await runWatch(['--node-id', temperatureTag.nodeId]);

        subscribedHandler?.({
            ...temperatureTag,
            oldValue: 72.4,
            newValue: 72.41,
            significant: false,
            timestamp: '2026-01-01T12:04:31.201Z',
        });

        expect(logSpy).not.toHaveBeenCalled();
    });

    it('prints every update, significant or not, at --log-level trace', async () => {
        mockedConnect.mockResolvedValue(undefined);
        mockedRequest.mockResolvedValue([temperatureTag]);

        await runWatch(['--node-id', temperatureTag.nodeId, '--log-level', 'trace']);

        subscribedHandler?.({
            ...temperatureTag,
            oldValue: 72.4,
            newValue: 72.41,
            significant: false,
            timestamp: '2026-01-01T12:04:31.201Z',
        });

        expect(logSpy).toHaveBeenCalledTimes(1);
    });

    it('ignores updates for tags outside the resolved selector (e.g. a global tag-updates channel)', async () => {
        mockedConnect.mockResolvedValue(undefined);
        mockedRequest.mockResolvedValue([temperatureTag]);

        await runWatch(['--node-id', temperatureTag.nodeId]);

        subscribedHandler?.({
            device: 'PLC2',
            deviceName: 'PLC 2',
            browseName: 'Pump Running',
            nodeId: 'ns=1;s=PLC2.PumpRunning',
            type: 'boolean',
            oldValue: false,
            newValue: true,
            significant: true,
            timestamp: '2026-01-01T12:04:31.201Z',
        });

        expect(logSpy).not.toHaveBeenCalled();
    });

    it('unsubscribes and disconnects, then exits 0, on SIGINT', async () => {
        mockedConnect.mockResolvedValue(undefined);
        mockedRequest.mockResolvedValue([temperatureTag]);

        await runWatch(['--node-id', temperatureTag.nodeId]);

        expect(sigintHandler).toBeInstanceOf(Function);
        expect(() => sigintHandler?.()).toThrow(ProcessExitSignal);

        expect(mockedUnsubscribe).toHaveBeenCalledTimes(1);
        expect(mockedDisconnect).toHaveBeenCalledTimes(1);
        expect(exitSpy).toHaveBeenNthCalledWith(1, ExitCode.SUCCESS);
    });

    it('exits ExitCode.VALIDATION_ERROR when --device and --node-id are combined, without connecting', async () => {
        await expect(runWatch(['--device', 'PLC1', '--node-id', 'ns=1;s=X'])).rejects.toBeInstanceOf(
            ProcessExitSignal,
        );

        expect(exitSpy).toHaveBeenNthCalledWith(1, ExitCode.VALIDATION_ERROR);
        expect(mockedConnect).not.toHaveBeenCalled();
    });

    it('allows --browse-name combined with --device (disambiguation)', async () => {
        mockedConnect.mockResolvedValue(undefined);
        mockedRequest.mockResolvedValue([temperatureTag]);

        await runWatch(['--device', 'PLC1', '--browse-name', 'Temperature1']);

        expect(mockedRequest).toHaveBeenCalledWith('tags.resolve', {
            device: 'PLC1',
            nodeId: undefined,
            browseName: 'Temperature1',
            tags: undefined,
        });
        expect(mockedSubscribe).toHaveBeenCalled();
    });

    it('exits ExitCode.SERVER_ERROR quickly when the server is unreachable, without resolving or subscribing', async () => {
        mockedConnect.mockRejectedValue(
            new ServerError(ErrorCode.SERVER_NOT_RUNNING, 'No running OPC UA server was found'),
        );

        await expect(runWatch(['--device', 'PLC1'])).rejects.toBeInstanceOf(ProcessExitSignal);

        expect(exitSpy).toHaveBeenNthCalledWith(1, ExitCode.SERVER_ERROR);
        expect(mockedRequest).not.toHaveBeenCalled();
        expect(mockedSubscribe).not.toHaveBeenCalled();
    });

    it('reports an ambiguous browse-name match with the categorized exit code, and disconnects', async () => {
        mockedConnect.mockResolvedValue(undefined);
        mockedRequest.mockRejectedValue(
            new RemoteControlError(
                ErrorCode.TAG_BROWSE_NAME_AMBIGUOUS,
                'Multiple tags named "Temperature1" found — specify --device to disambiguate:\n  PLC1.Temperature1 (ns=2;s=PLC1.Temperature1)\n  PLC2.Temperature1 (ns=2;s=PLC2.Temperature1)',
                ExitCode.TAG_ERROR,
            ),
        );

        await expect(runWatch(['--browse-name', 'Temperature1'])).rejects.toBeInstanceOf(ProcessExitSignal);

        expect(exitSpy).toHaveBeenNthCalledWith(1, ExitCode.TAG_ERROR);
        const output = errorSpy.mock.calls.map((call) => call[0]).join('\n');
        expect(output).toContain('TAG_BROWSE_NAME_AMBIGUOUS');
        expect(output).toContain('PLC1.Temperature1');
        expect(output).toContain('PLC2.Temperature1');
        expect(mockedDisconnect).toHaveBeenCalledTimes(1);
        expect(mockedSubscribe).not.toHaveBeenCalled();
    });

    it('targets the socket for the given --port', async () => {
        mockedConnect.mockResolvedValue(undefined);
        mockedRequest.mockResolvedValue([temperatureTag]);

        await runWatch(['--node-id', temperatureTag.nodeId, '--port', '4881']);

        expect(mockedControlClientCtor).toHaveBeenCalledWith(expect.stringContaining('4881'));
    });
});
