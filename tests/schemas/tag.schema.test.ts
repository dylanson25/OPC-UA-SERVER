import { describe, it, expect } from 'vitest';
import { TagSchema } from '../../src/schemas/tag.schema.ts';

describe('TagSchema', () => {
    describe('common fields (all variants)', () => {
        it('rejects a tag with empty browseName', () => {
            const result = TagSchema.safeParse({
                browseName: '',
                nodeId: 'ns=1;s=Tag1',
                type: 'integer',
            });

            expect(result.success).toBe(false);
        });

        it('rejects a tag with empty nodeId', () => {
            const result = TagSchema.safeParse({
                browseName: 'Tag1',
                nodeId: '',
                type: 'integer',
            });

            expect(result.success).toBe(false);
        });

        it('rejects a tag with an invalid type literal', () => {
            const result = TagSchema.safeParse({
                browseName: 'Tag1',
                nodeId: 'ns=1;s=Tag1',
                type: 'unknownType',
            });

            expect(result.success).toBe(false);
        });

        it('rejects a tag missing the type field entirely', () => {
            const result = TagSchema.safeParse({
                browseName: 'Tag1',
                nodeId: 'ns=1;s=Tag1',
            });

            expect(result.success).toBe(false);
        });
    });

    describe('threshold field (common to all types)', () => {

        it('accepts a float tag with threshold', () => {
            const result = TagSchema.safeParse({
                browseName: 'Temperature',
                nodeId: 'ns=1;s=Temp',
                type: 'float',
                initialValue: 72.5,
                threshold: 0.1,
            });

            expect(result.success).toBe(true);
        });

        it('rejects a non-numeric threshold', () => {
            const result = TagSchema.safeParse({
                browseName: 'Temperature',
                nodeId: 'ns=1;s=Temp',
                type: 'float',
                initialValue: 72.5,
                threshold: '0.1',
            });

            expect(result.success).toBe(false);
        });

        it('omits threshold successfully (optional field)', () => {
            const result = TagSchema.safeParse({
                browseName: 'Temperature',
                nodeId: 'ns=1;s=Temp',
                type: 'float',
                initialValue: 72.5,
            });

            expect(result.success).toBe(true);
        });
    });

    describe('boolean type', () => {
        it('accepts a valid boolean tag without optional fields', () => {
            const result = TagSchema.safeParse({
                browseName: 'Running',
                nodeId: 'ns=1;s=Running',
                type: 'boolean',
            });

            expect(result.success).toBe(true);
        });

        it('rejects a boolean tag with a non-boolean initialValue', () => {
            const result = TagSchema.safeParse({
                browseName: 'Running',
                nodeId: 'ns=1;s=Running',
                type: 'boolean',
                initialValue: 'true',
            });

            expect(result.success).toBe(false);
        });

    });

    describe('integer type', () => {
        it('accepts a valid integer tag', () => {
            const result = TagSchema.safeParse({
                browseName: 'Count',
                nodeId: 'ns=1;s=Count',
                type: 'integer',
                initialValue: 10,
            });

            expect(result.success).toBe(true);
        });

        it('rejects an integer tag with a float initialValue', () => {
            const result = TagSchema.safeParse({
                browseName: 'Count',
                nodeId: 'ns=1;s=Count',
                type: 'integer',
                initialValue: 10.5,
            });

            expect(result.success).toBe(false);
        });

        it('accepts threshold on integer type', () => {
            const result = TagSchema.safeParse({
                browseName: 'Count',
                nodeId: 'ns=1;s=Count',
                type: 'integer',
                initialValue: 10,
                threshold: 1,
            });

            expect(result.success).toBe(true);
        });
    });

    describe('float type', () => {
        it('accepts a valid float tag', () => {
            const result = TagSchema.safeParse({
                browseName: 'Temperature',
                nodeId: 'ns=1;s=Temp',
                type: 'float',
                initialValue: 72.5,
            });

            expect(result.success).toBe(true);
        });

        it('rejects a float tag with a string initialValue', () => {
            const result = TagSchema.safeParse({
                browseName: 'Temperature',
                nodeId: 'ns=1;s=Temp',
                type: 'float',
                initialValue: '72.5',
            });

            expect(result.success).toBe(false);
        });
    });

    describe('double type', () => {
        it('accepts a valid double tag', () => {
            const result = TagSchema.safeParse({
                browseName: 'Pressure',
                nodeId: 'ns=1;s=Pressure',
                type: 'double',
                initialValue: 101.325,
            });

            expect(result.success).toBe(true);
        });
    });

    describe('string type', () => {
        it('accepts a valid string tag', () => {
            const result = TagSchema.safeParse({
                browseName: 'Status',
                nodeId: 'ns=1;s=Status',
                type: 'string',
                initialValue: 'OK',
            });

            expect(result.success).toBe(true);
        });

        it('rejects a string tag with a numeric initialValue', () => {
            const result = TagSchema.safeParse({
                browseName: 'Status',
                nodeId: 'ns=1;s=Status',
                type: 'string',
                initialValue: 123,
            });

            expect(result.success).toBe(false);
        });
    });

    describe('dateTime type', () => {
        it('accepts a dateTime tag with a string initialValue', () => {
            const result = TagSchema.safeParse({
                browseName: 'LastUpdate',
                nodeId: 'ns=1;s=LastUpdate',
                type: 'dateTime',
                initialValue: '2026-07-31T12:00:00Z',
            });

            expect(result.success).toBe(true);
        });

        it('accepts a dateTime tag with a numeric (epoch) initialValue', () => {
            const result = TagSchema.safeParse({
                browseName: 'LastUpdate',
                nodeId: 'ns=1;s=LastUpdate',
                type: 'dateTime',
                initialValue: 1753963200000,
            });

            expect(result.success).toBe(true);
        });

        it('accepts a dateTime tag with a Date instance', () => {
            const result = TagSchema.safeParse({
                browseName: 'LastUpdate',
                nodeId: 'ns=1;s=LastUpdate',
                type: 'dateTime',
                initialValue: new Date(),
            });

            expect(result.success).toBe(true);
        });

        it('rejects a dateTime tag with a boolean initialValue', () => {
            const result = TagSchema.safeParse({
                browseName: 'LastUpdate',
                nodeId: 'ns=1;s=LastUpdate',
                type: 'dateTime',
                initialValue: true,
            });

            expect(result.success).toBe(false);
        });
    });

    describe('cross-type mismatches', () => {
        it('rejects a tag where type is "integer" but initialValue matches boolean shape', () => {
            const result = TagSchema.safeParse({
                browseName: 'Count',
                nodeId: 'ns=1;s=Count',
                type: 'integer',
                initialValue: true,
            });

            expect(result.success).toBe(false);
        });
    });
});