import { describe, it, expect } from 'vitest';
import { InvalidArgumentError } from 'commander';

import { PINO_LOG_LEVELS, isPinoLogLevel, parseLogLevel } from '../../src/cli/log-levels.ts';

describe('isPinoLogLevel', () => {
    it.each(PINO_LOG_LEVELS)('accepts "%s" as a valid level', (level) => {
        expect(isPinoLogLevel(level)).toBe(true);
    });

    it('rejects an unknown level', () => {
        expect(isPinoLogLevel('bogus')).toBe(false);
    });

    it('is case-sensitive (does not accept "DEBUG")', () => {
        expect(isPinoLogLevel('DEBUG')).toBe(false);
    });
});

describe('parseLogLevel', () => {
    it.each(PINO_LOG_LEVELS)('returns "%s" unchanged when valid', (level) => {
        expect(parseLogLevel(level)).toBe(level);
    });

    it('throws InvalidArgumentError for an invalid value', () => {
        expect(() => parseLogLevel('bogus')).toThrow(InvalidArgumentError);
    });

    it('lists every valid level in the error message', () => {
        try {
            parseLogLevel('bogus');
            throw new Error('expected parseLogLevel to throw');
        } catch (err) {
            expect(err).toBeInstanceOf(InvalidArgumentError);
            for (const level of PINO_LOG_LEVELS) {
                expect((err as Error).message).toContain(level);
            }
        }
    });
});
