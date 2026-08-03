import { describe, it, expect, vi } from 'vitest';

import { logAppError } from '../../src/errors/log-app-error.ts';
import { DeviceError } from '../../src/errors/device-error.ts';
import { ErrorCode } from '../../src/errors/error-codes.ts';
import { ExitCode } from '../../src/errors/exit-code.ts';

describe('logAppError', () => {
    it('calls logger.error with a structured payload and the error message', () => {
        const logger = { error: vi.fn() };
        const error = new DeviceError(ErrorCode.DEVICE_REGISTRATION_FAILED, 'Failed to register device', {
            key: 'PLC1',
        });

        logAppError(logger, error);

        expect(logger.error).toHaveBeenCalledTimes(1);
        expect(logger.error).toHaveBeenCalledWith(
            {
                code: ErrorCode.DEVICE_REGISTRATION_FAILED,
                category: 'DeviceError',
                exitCode: ExitCode.DEVICE_ERROR,
                context: { key: 'PLC1' },
                err: error,
            },
            'Failed to register device',
        );
    });

    it('merges extra fields into the logged payload', () => {
        const logger = { error: vi.fn() };
        const error = new DeviceError(ErrorCode.DEVICE_REGISTRATION_FAILED, 'Failed to register device');

        logAppError(logger, error, { source: 'uncaughtException' });

        const [payload] = logger.error.mock.calls[0];
        expect(payload.source).toBe('uncaughtException');
    });
});
