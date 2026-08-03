import { describe, it, expect } from 'vitest';

import { AppError } from '../../src/errors/app-error.ts';
import { ConfigurationError } from '../../src/errors/configuration-error.ts';
import { ValidationError } from '../../src/errors/validation-error.ts';
import { DeviceError } from '../../src/errors/device-error.ts';
import { TagError } from '../../src/errors/tag-error.ts';
import { ServerError } from '../../src/errors/server-error.ts';
import { RuntimeError } from '../../src/errors/runtime-error.ts';
import { ErrorCode } from '../../src/errors/error-codes.ts';
import { ExitCode } from '../../src/errors/exit-code.ts';

describe('AppError category classes', () => {
    const cases: [name: string, ErrorClass: new (code: ErrorCode, message: string, context?: Record<string, unknown>) => AppError, expectedExitCode: ExitCode][] = [
        ['ConfigurationError', ConfigurationError, ExitCode.CONFIGURATION_ERROR],
        ['ValidationError', ValidationError, ExitCode.VALIDATION_ERROR],
        ['DeviceError', DeviceError, ExitCode.DEVICE_ERROR],
        ['TagError', TagError, ExitCode.TAG_ERROR],
        ['ServerError', ServerError, ExitCode.SERVER_ERROR],
        ['RuntimeError', RuntimeError, ExitCode.RUNTIME_ERROR],
    ];

    it.each(cases)('%s extends AppError and Error, and carries the right exitCode', (
        _name,
        ErrorClass,
        expectedExitCode,
    ) => {
        const error = new ErrorClass(ErrorCode.UNKNOWN_ERROR, 'something failed', { foo: 'bar' });

        expect(error).toBeInstanceOf(AppError);
        expect(error).toBeInstanceOf(Error);
        expect(error.exitCode).toBe(expectedExitCode);
        expect(error.code).toBe(ErrorCode.UNKNOWN_ERROR);
        expect(error.message).toBe('something failed');
        expect(error.context).toEqual({ foo: 'bar' });
        expect(error.name).toBe(ErrorClass.name);
    });

    it('context is undefined when not provided', () => {
        const error = new DeviceError(ErrorCode.DEVICE_REGISTRATION_FAILED, 'failed');

        expect(error.context).toBeUndefined();
    });
});
