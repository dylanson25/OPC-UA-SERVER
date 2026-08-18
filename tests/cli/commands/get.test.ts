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
import { ExitCode, ErrorCode, ServerError } from '../../../src/errors/index.ts';
import { RemoteControlError } from '../../../src/control/index.ts';
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

async function runGet(args: string[] = []): Promise<void> {
    const program = createProgram();
    silenceCommanderOutput(program);
    await program.parseAsync(['get', ...args], { from: 'user' });
}

describe('get command', () => {
    it('reads every tag of a device, prints one aligned line per tag, and exits SUCCESS', async () => {
        mockedConnect.mockResolvedValue(undefined);
        mockedRequest.mockResolvedValue([
            {
                device: 'PLC1',
                deviceName: 'PLC 1',
                browseName: 'Temperature1',
                nodeId: 'ns=2;s=PLC1.Temperature1',
                type: 'float',
                value: 72.6,
            },
            {
                device: 'PLC1',
                deviceName: 'PLC 1',
                browseName: 'HomeSwitchStatus',
                nodeId: 'ns=2;s=PLC1.HomeSwitchStatus',
                type: 'boolean',
                value: true,
            },
        ]);

        await expect(runGet(['--device', 'PLC1'])).rejects.toBeInstanceOf(ProcessExitSignal);

        expect(exitSpy).toHaveBeenNthCalledWith(1, ExitCode.SUCCESS);
        expect(mockedRequest).toHaveBeenCalledWith('tags.get', {
            device: 'PLC1',
            nodeId: undefined,
            browseName: undefined,
            tags: undefined,
        });

        const lines = logSpy.mock.calls.map((call) => call[0] as string);
        expect(lines).toHaveLength(2);
        expect(lines[0]).toMatch(/^PLC1\.Temperature1\s+72\.6$/);
        expect(lines[1]).toMatch(/^PLC1\.HomeSwitchStatus\s+true$/);

        // Both value columns start at the same index — that's the "padded columns"
        // behavior from the issue's example output, verified without hand-counting
        // spaces (which line lengths differ by, since labels differ in length).
        const valueColumn = (line: string) => line.search(/\S+$/);
        expect(valueColumn(lines[0])).toBe(valueColumn(lines[1]));

        expect(mockedDisconnect).toHaveBeenCalledTimes(1);
    });

    it('reads a single tag by --node-id', async () => {
        mockedConnect.mockResolvedValue(undefined);
        mockedRequest.mockResolvedValue([
            {
                device: 'PLC1',
                deviceName: 'PLC 1',
                browseName: 'Temperature1',
                nodeId: 'ns=2;s=PLC1.Temperature1',
                type: 'float',
                value: 72.6,
            },
        ]);

        await expect(runGet(['--node-id', 'ns=2;s=PLC1.Temperature1'])).rejects.toBeInstanceOf(ProcessExitSignal);

        expect(mockedRequest).toHaveBeenCalledWith('tags.get', {
            device: undefined,
            nodeId: 'ns=2;s=PLC1.Temperature1',
            browseName: undefined,
            tags: undefined,
        });
        expect(logSpy).toHaveBeenCalledWith(expect.stringMatching(/^PLC1\.Temperature1\s+72\.6$/));
    });

    it('reads a single tag by --browse-name', async () => {
        mockedConnect.mockResolvedValue(undefined);
        mockedRequest.mockResolvedValue([
            {
                device: 'PLC1',
                deviceName: 'PLC 1',
                browseName: 'Temperature1',
                nodeId: 'ns=2;s=PLC1.Temperature1',
                type: 'float',
                value: 72.6,
            },
        ]);

        await expect(runGet(['--browse-name', 'Temperature1'])).rejects.toBeInstanceOf(ProcessExitSignal);

        expect(mockedRequest).toHaveBeenCalledWith('tags.get', {
            device: undefined,
            nodeId: undefined,
            browseName: 'Temperature1',
            tags: undefined,
        });
    });

    it('reads a --tags subset of a device, forwarding a split/trimmed array', async () => {
        mockedConnect.mockResolvedValue(undefined);
        mockedRequest.mockResolvedValue([
            {
                device: 'PLC1',
                deviceName: 'PLC 1',
                browseName: 'Temperature1',
                nodeId: 'ns=2;s=PLC1.Temperature1',
                type: 'float',
                value: 72.6,
            },
            {
                device: 'PLC1',
                deviceName: 'PLC 1',
                browseName: 'Temperature2',
                nodeId: 'ns=2;s=PLC1.Temperature2',
                type: 'float',
                value: 68.1,
            },
        ]);

        await expect(runGet(['--device', 'PLC1', '--tags', 'Temperature1,Temperature2'])).rejects.toBeInstanceOf(
            ProcessExitSignal,
        );

        expect(mockedRequest).toHaveBeenCalledWith('tags.get', {
            device: 'PLC1',
            nodeId: undefined,
            browseName: undefined,
            tags: ['Temperature1', 'Temperature2'],
        });
    });

    it('exits ExitCode.VALIDATION_ERROR when no selector is given, without ever connecting', async () => {
        await expect(runGet()).rejects.toBeInstanceOf(ProcessExitSignal);

        expect(exitSpy).toHaveBeenNthCalledWith(1, ExitCode.VALIDATION_ERROR);
        expect(mockedConnect).not.toHaveBeenCalled();
        const output = errorSpy.mock.calls.map((call) => call[0]).join('\n');
        expect(output).toContain('TAG_SELECTOR_INVALID');
    });

    it('exits ExitCode.VALIDATION_ERROR when --tags is combined with --browse-name', async () => {
        await expect(runGet(['--device', 'PLC1', '--browse-name', 'X', '--tags', 'Y'])).rejects.toBeInstanceOf(
            ProcessExitSignal,
        );

        expect(exitSpy).toHaveBeenNthCalledWith(1, ExitCode.VALIDATION_ERROR);
        expect(mockedConnect).not.toHaveBeenCalled();
    });

    it('exits ExitCode.SERVER_ERROR quickly when the server is unreachable', async () => {
        mockedConnect.mockRejectedValue(
            new ServerError(ErrorCode.SERVER_NOT_RUNNING, 'No running OPC UA server was found'),
        );

        await expect(runGet(['--device', 'PLC1'])).rejects.toBeInstanceOf(ProcessExitSignal);

        expect(exitSpy).toHaveBeenNthCalledWith(1, ExitCode.SERVER_ERROR);
        expect(mockedRequest).not.toHaveBeenCalled();
    });

    it('exits with the categorized code the server reported for an unresolvable selector', async () => {
        mockedConnect.mockResolvedValue(undefined);
        mockedRequest.mockRejectedValue(
            new RemoteControlError(
                ErrorCode.DEVICE_NOT_FOUND,
                'No device found with key "NOPE"',
                ExitCode.DEVICE_ERROR,
            ),
        );

        await expect(runGet(['--device', 'NOPE'])).rejects.toBeInstanceOf(ProcessExitSignal);

        expect(exitSpy).toHaveBeenNthCalledWith(1, ExitCode.DEVICE_ERROR);
        const output = errorSpy.mock.calls.map((call) => call[0]).join('\n');
        expect(output).toContain('DEVICE_NOT_FOUND');
        expect(mockedDisconnect).toHaveBeenCalledTimes(1);
    });

    it('targets the socket for the given --port', async () => {
        mockedConnect.mockResolvedValue(undefined);
        mockedRequest.mockResolvedValue([
            {
                device: 'PLC1',
                deviceName: 'PLC 1',
                browseName: 'Temperature1',
                nodeId: 'ns=2;s=PLC1.Temperature1',
                type: 'float',
                value: 72.6,
            },
        ]);

        await expect(runGet(['--device', 'PLC1', '--port', '4881'])).rejects.toBeInstanceOf(ProcessExitSignal);

        expect(mockedControlClientCtor).toHaveBeenCalledWith(expect.stringContaining('4881'));
    });
});
