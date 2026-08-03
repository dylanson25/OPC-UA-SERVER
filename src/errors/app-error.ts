import type { ErrorCode } from './error-codes.ts';
import type { ExitCode } from './exit-code.ts';

export abstract class AppError extends Error {
    abstract readonly code: ErrorCode;
    abstract readonly exitCode: ExitCode;
    readonly context?: Record<string, unknown>;

    protected constructor(message: string, context?: Record<string, unknown>) {
        super(message);
        this.name = new.target.name;
        this.context = context;
    }
}
