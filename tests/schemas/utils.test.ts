import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { validateUnique } from '../../src/schemas/utils.ts';

function runValidateUnique<T>(
    items: T[],
    selector: (item: T) => string,
    field: string,
    basePath: (string | number)[] = [],
    getPath?: (item: T, index: number) => (string | number)[],
): z.core.$ZodIssue[] {
    const schema = z.array(z.any()).superRefine((_items, ctx) => {
        validateUnique(items, selector, field, ctx, basePath, getPath);
    });

    const result = schema.safeParse(items);
    return result.success ? [] : result.error.issues;
}

describe('validateUnique', () => {
    it('produces no issues when all values are unique', () => {
        const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
        const issues = runValidateUnique(items, (i) => i.id, 'id', ['items']);

        expect(issues).toHaveLength(0);
    });

    it('produces one issue for a single duplicate pair', () => {
        const items = [{ id: 'a' }, { id: 'b' }, { id: 'a' }];
        const issues = runValidateUnique(items, (i) => i.id, 'id', ['items']);

        expect(issues).toHaveLength(1);
        expect(issues[0].path).toEqual(['items', 2, 'id']);
        expect(issues[0].message).toBe("Duplicate id: 'a'.");
    });

    it('flags the second AND third occurrence when a value repeats three times', () => {
        const items = [{ id: 'a' }, { id: 'a' }, { id: 'a' }];
        const issues = runValidateUnique(items, (i) => i.id, 'id', ['items']);

        expect(issues).toHaveLength(2);
        expect(issues[0].path).toEqual(['items', 1, 'id']);
        expect(issues[1].path).toEqual(['items', 2, 'id']);
    });

    it('respects a custom getPath function instead of index-based path', () => {
        const items: [string, { name: string }][] = [
            ['key1', { name: 'Motor1' }],
            ['key2', { name: 'Motor1' }],
        ];

        const issues = runValidateUnique(
            items,
            ([, device]) => device.name,
            'name',
            [],
            ([key]) => [key],
        );

        expect(issues).toHaveLength(1);
        expect(issues[0].path).toEqual(['key2', 'name']);
    });

    it('produces no issues on an empty array', () => {
        const issues = runValidateUnique<{ id: string }>([], (i) => i.id, 'id', ['items']);

        expect(issues).toHaveLength(0);
    });

    it('produces no issues on a single-item array', () => {
        const issues = runValidateUnique([{ id: 'a' }], (i) => i.id, 'id', ['items']);

        expect(issues).toHaveLength(0);
    });
});