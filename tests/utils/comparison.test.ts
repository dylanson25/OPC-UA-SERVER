import { describe, it, expect } from 'vitest';
import { hasSignificantChange } from '../../src/utils/index.ts';

describe('hasSignificantChange', () => {
    describe('numeric values', () => {
        it('returns false when the difference is within the threshold', () => {
            expect(hasSignificantChange(72.0, 72.005, 0.01)).toBe(false);
        });

        it('returns true when the difference exceeds the threshold', () => {
            expect(hasSignificantChange(72.0, 72.5, 0.01)).toBe(true);
        });

        it('returns false when values are exactly equal', () => {
            expect(hasSignificantChange(72.0, 72.0, 0.01)).toBe(false);
        });

        it('returns true when the difference is just over the threshold', () => {
            expect(hasSignificantChange(72.0, 72.02, 0.01)).toBe(true);
        });

        it('returns false when the difference is comfortably within the threshold', () => {
            expect(hasSignificantChange(72.0, 72.005, 0.01)).toBe(false);
        });

        it('handles negative differences the same as positive (uses abs)', () => {
            expect(hasSignificantChange(72.5, 72.0, 0.01)).toBe(true);
        });

        it('uses default threshold of 0.01 when not provided', () => {
            expect(hasSignificantChange(1, 1.02)).toBe(true);
            expect(hasSignificantChange(1, 1.005)).toBe(false);
        });
    });

    describe('non-numeric values', () => {
        it('compares booleans by strict equality', () => {
            expect(hasSignificantChange(true, false)).toBe(true);
            expect(hasSignificantChange(true, true)).toBe(false);
        });

        it('compares strings by strict equality', () => {
            expect(hasSignificantChange('OK', 'FAULT')).toBe(true);
            expect(hasSignificantChange('OK', 'OK')).toBe(false);
        });

        it('treats a type change (number to string) as a significant change', () => {
            expect(hasSignificantChange(72, '72')).toBe(true);
        });
    });

    describe('NaN handling', () => {
        it('treats NaN vs a real number as a change', () => {
            expect(hasSignificantChange(NaN, 72)).toBe(true);
        });

        it('treats NaN vs NaN as a change (NaN !== NaN)', () => {
            expect(hasSignificantChange(NaN, NaN)).toBe(true);
        });
    });
});