import { describe, it, expect } from 'vitest';
import { z } from 'zod';

import { ValidationError } from '../../src/errors/validation-error.ts';
import { ErrorCode } from '../../src/errors/error-codes.ts';
import { ExitCode } from '../../src/errors/exit-code.ts';
import { DevicesSchema } from '../../src/schemas/index.ts';

function parseInvalid(devices: unknown): z.ZodError {
    const result = DevicesSchema.safeParse(devices);
    if (result.success) throw new Error('Expected schema validation to fail in test fixture');
    return result.error;
}

describe('ValidationError.fromZodError', () => {
    it('sets exitCode and top-level code', () => {
        const zodError = parseInvalid({ device1: {} });
        const error = ValidationError.fromZodError(zodError);

        expect(error.exitCode).toBe(ExitCode.VALIDATION_ERROR);
        expect(error.code).toBe(ErrorCode.DEVICE_CONFIG_INVALID);
    });

    it('builds a human-readable message from the first issue in Path/Reason format', () => {
        const zodError = parseInvalid({ device1: {} });
        const error = ValidationError.fromZodError(zodError);
        const [firstIssue] = zodError.issues;

        expect(error.message).toBe(
            `Path:\n${firstIssue.path.join('.')}\n\nReason:\n${firstIssue.message}`,
        );
    });

    it('includes every issue in context.issues with path and reason', () => {
        const zodError = parseInvalid({ device1: {} });
        const error = ValidationError.fromZodError(zodError);

        const issues = error.context?.issues as { path: string; reason: string }[];
        expect(issues).toHaveLength(zodError.issues.length);
        expect(issues[0]).toMatchObject({
            path: zodError.issues[0].path.join('.'),
            reason: zodError.issues[0].message,
        });
    });

    it('tags a duplicate nodeId issue with ErrorCode.NODE_ID_DUPLICATE', () => {
        const zodError = parseInvalid({
            device1: {
                name: 'Motor1',
                nodeId: 'ns=1;s=Motor1',
                tags: [
                    { type: 'boolean', browseName: 'Tag1', nodeId: 'ns=1;s=Dup' },
                    { type: 'boolean', browseName: 'Tag2', nodeId: 'ns=1;s=Dup' },
                ],
            },
        });
        const error = ValidationError.fromZodError(zodError);

        const issues = error.context?.issues as { path: string; reason: string; code?: string }[];
        const duplicateIssue = issues.find((issue) => issue.reason.startsWith('Duplicate nodeId:'));

        expect(duplicateIssue).toBeDefined();
        expect(duplicateIssue?.code).toBe(ErrorCode.NODE_ID_DUPLICATE);
    });

    it('does not tag non-duplicate issues with a code', () => {
        const zodError = parseInvalid({ device1: {} });
        const error = ValidationError.fromZodError(zodError);

        const issues = error.context?.issues as { code?: string }[];
        expect(issues.every((issue) => issue.code === undefined)).toBe(true);
    });

    it('merges additional context passed in', () => {
        const zodError = parseInvalid({ device1: {} });
        const error = ValidationError.fromZodError(zodError, { file: 'devices.json' });

        expect(error.context?.file).toBe('devices.json');
    });

    it('falls back to a generic message when there are no issues', () => {
        const emptyZodError = new z.ZodError([]);
        const error = ValidationError.fromZodError(emptyZodError);

        expect(error.message).toBe('Device configuration validation failed');
    });
});
