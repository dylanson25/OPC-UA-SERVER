import type { AppError } from './app-error.ts';

export interface ErrorLogger {
    error(obj: Record<string, unknown>, msg?: string): void;
}

export function logAppError(
    logger: ErrorLogger,
    error: AppError,
    extra?: Record<string, unknown>,
): void {
    logger.error(
        {
            code: error.code,
            category: error.constructor.name,
            exitCode: error.exitCode,
            context: error.context,
            err: error,
            ...extra,
        },
        error.message,
    );
}
