import type { z } from 'zod';

import { AppError } from './app-error.ts';
import { ErrorCode } from './error-codes.ts';
import { ExitCode } from './exit-code.ts';

const DUPLICATE_NODE_ID_PATTERN = /^Duplicate nodeId:/;

interface ValidationIssue {
    path: string;
    reason: string;
    code?: ErrorCode;
}

export class ValidationError extends AppError {
    readonly exitCode = ExitCode.VALIDATION_ERROR;

    constructor(
        readonly code: ErrorCode,
        message: string,
        context?: Record<string, unknown>,
    ) {
        super(message, context);
    }

    static fromZodError(error: z.ZodError, context?: Record<string, unknown>): ValidationError {
        const issues: ValidationIssue[] = error.issues.map((issue) => ({
            path: issue.path.join('.'),
            reason: issue.message,
            ...(DUPLICATE_NODE_ID_PATTERN.test(issue.message)
                ? { code: ErrorCode.NODE_ID_DUPLICATE }
                : {}),
        }));

        const [first] = issues;
        const message = first
            ? `Path:\n${first.path}\n\nReason:\n${first.reason}`
            : 'Device configuration validation failed';

        return new ValidationError(ErrorCode.DEVICE_CONFIG_INVALID, message, {
            ...context,
            issues,
        });
    }
}
