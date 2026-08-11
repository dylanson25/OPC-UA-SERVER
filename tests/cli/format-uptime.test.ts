import { describe, it, expect } from 'vitest';

import { formatUptime } from '../../src/cli/format-uptime.ts';

describe('formatUptime', () => {
    it('formats the example from the issue (4h 12m)', () => {
        const ms = (4 * 60 + 12) * 60_000;
        expect(formatUptime(ms)).toBe('4h 12m');
    });

    it('formats zero uptime', () => {
        expect(formatUptime(0)).toBe('0h 0m');
    });

    it('formats less than a minute as 0h 0m', () => {
        expect(formatUptime(45_000)).toBe('0h 0m');
    });

    it('formats exactly one hour', () => {
        expect(formatUptime(60 * 60_000)).toBe('1h 0m');
    });

    it('includes a day segment once uptime exceeds 24h', () => {
        const ms = (25 * 60 + 5) * 60_000; // 25h 5m -> 1d 1h 5m
        expect(formatUptime(ms)).toBe('1d 1h 5m');
    });

    it('never returns a negative value for a negative input', () => {
        expect(formatUptime(-1000)).toBe('0h 0m');
    });
});
