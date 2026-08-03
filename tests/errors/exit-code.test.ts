import { describe, it, expect } from 'vitest';

import { ExitCode } from '../../src/errors/exit-code.ts';

describe('ExitCode', () => {
    it('keeps stable, backward-compatible numeric values', () => {
        expect(ExitCode.SUCCESS).toBe(0);
        expect(ExitCode.UNKNOWN_ERROR).toBe(1);
        expect(ExitCode.CONFIGURATION_ERROR).toBe(2);
        expect(ExitCode.VALIDATION_ERROR).toBe(3);
        expect(ExitCode.DEVICE_ERROR).toBe(4);
        expect(ExitCode.TAG_ERROR).toBe(5);
        expect(ExitCode.SERVER_ERROR).toBe(6);
        expect(ExitCode.RUNTIME_ERROR).toBe(7);
    });
});
