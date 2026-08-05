import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockedValidateDevicesConfigFile = vi.hoisted(() => vi.fn());

vi.mock('../../../src/devices/config-reader.ts', () => ({
    validateDevicesConfigFile: mockedValidateDevicesConfigFile,
}));

import { createProgram } from '../../../src/cli/program.ts';
import { ConfigurationError, ErrorCode, ExitCode, ValidationError } from '../../../src/errors/index.ts';
import { mockProcessExit, silenceCommanderOutput, ProcessExitSignal } from '../process-exit-helper.ts';

let exitSpy: ReturnType<typeof mockProcessExit>;
let logSpy: ReturnType<typeof vi.spyOn>;
let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
    mockedValidateDevicesConfigFile.mockClear();
    exitSpy = mockProcessExit();
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
    exitSpy.mockRestore();
    logSpy.mockRestore();
    errorSpy.mockRestore();
});

async function runValidate(file: string): Promise<void> {
    const program = createProgram();
    silenceCommanderOutput(program);
    await program.parseAsync(['validate', file], { from: 'user' });
}

describe('validate command', () => {
    it('prints a device/tag count summary and exits ExitCode.SUCCESS for a valid file', async () => {
        mockedValidateDevicesConfigFile.mockReturnValue({
            ok: true,
            data: {
                PLC1: {
                    name: 'PLC 1',
                    nodeId: 'ns=1;s=PLC1',
                    tags: [
                        { type: 'boolean', browseName: 'A', nodeId: 'ns=1;s=A' },
                        { type: 'boolean', browseName: 'B', nodeId: 'ns=1;s=B' },
                    ],
                },
                PLC2: { name: 'PLC 2', nodeId: 'ns=1;s=PLC2', tags: [] },
            },
        });

        await expect(runValidate('devices.json')).rejects.toBeInstanceOf(ProcessExitSignal);

        expect(mockedValidateDevicesConfigFile).toHaveBeenCalledWith('devices.json');
        expect(exitSpy).toHaveBeenNthCalledWith(1, ExitCode.SUCCESS);
        expect(logSpy.mock.calls[0][0]).toContain('2 device(s)');
        expect(logSpy.mock.calls[0][0]).toContain('2 tag(s)');
    });

    it('prints the error code/message and exits with the ConfigurationError exitCode for a missing file', async () => {
        const error = new ConfigurationError(ErrorCode.CONFIG_FILE_NOT_FOUND, 'Unable to read device file');
        mockedValidateDevicesConfigFile.mockReturnValue({ ok: false, error });

        await expect(runValidate('missing.json')).rejects.toBeInstanceOf(ProcessExitSignal);

        expect(exitSpy).toHaveBeenNthCalledWith(1, ExitCode.CONFIGURATION_ERROR);
        expect(errorSpy.mock.calls[0][0]).toContain('CONFIG_FILE_NOT_FOUND');
        expect(errorSpy.mock.calls[0][0]).toContain('Unable to read device file');
    });

    it('prints the Path:/Reason: message and exits with the ValidationError exitCode for an invalid file', async () => {
        const error = new ValidationError(
            ErrorCode.DEVICE_CONFIG_INVALID,
            'Path:\ndevices.PLC1.tags[1].nodeId\n\nReason:\nDuplicate nodeId detected',
        );
        mockedValidateDevicesConfigFile.mockReturnValue({ ok: false, error });

        await expect(runValidate('bad.json')).rejects.toBeInstanceOf(ProcessExitSignal);

        expect(exitSpy).toHaveBeenNthCalledWith(1, ExitCode.VALIDATION_ERROR);
        expect(errorSpy.mock.calls[0][0]).toContain('DEVICE_CONFIG_INVALID');
        expect(errorSpy.mock.calls[0][0]).toContain('Path:');
        expect(errorSpy.mock.calls[0][0]).toContain('Reason:');
    });

    it('requires the file argument', async () => {
        await expect(
            (async () => {
                const program = createProgram();
                silenceCommanderOutput(program);
                await program.parseAsync(['validate'], { from: 'user' });
            })(),
        ).rejects.toBeInstanceOf(ProcessExitSignal);

        expect(exitSpy).toHaveBeenNthCalledWith(1, ExitCode.VALIDATION_ERROR);
        expect(mockedValidateDevicesConfigFile).not.toHaveBeenCalled();
    });
});
