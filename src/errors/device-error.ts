import { AppError } from './app-error.ts';
import type { ErrorCode } from './error-codes.ts';
import { ExitCode } from './exit-code.ts';

export class DeviceError extends AppError {
    readonly exitCode = ExitCode.DEVICE_ERROR;

    constructor(
        readonly code: ErrorCode,
        message: string,
        context?: Record<string, unknown>,
    ) {
        super(message, context);
    }
}
