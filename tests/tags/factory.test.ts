import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as opcua from 'node-opcua';

vi.mock('../../src/tags/primitive.ts', () => ({
    addPrimitiveTag: vi.fn(),
}));

const mockedLogger = vi.hoisted(() => ({
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
}));

vi.mock('../../src/infrastructure/logger/index.ts', () => ({
    createModuleLogger: () => mockedLogger,
}));

import { createTag } from '../../src/tags/factory.ts';
import { addPrimitiveTag } from '../../src/tags/primitive.ts';
import { ErrorCode } from '../../src/errors/index.ts';

const mockedAddPrimitiveTag = vi.mocked(addPrimitiveTag);

const fakeNamespace = {} as any;
const fakeDevice = {} as any;

beforeEach(() => {
    mockedAddPrimitiveTag.mockClear();
    mockedLogger.error.mockClear();
});

describe('createTag', () => {
    describe('boolean type', () => {
        it('calls addPrimitiveTag with correct dataType and valueType', () => {
            createTag({
                namespace: fakeNamespace,
                device: fakeDevice,
                config: { type: 'boolean', browseName: 'Running', nodeId: 'ns=1;s=Running' },
            });

            expect(mockedAddPrimitiveTag).toHaveBeenCalledTimes(1);
            const callArgs = mockedAddPrimitiveTag.mock.calls[0][0];

            expect(callArgs.dataType).toBe('Boolean');
            expect(callArgs.valueType).toBe(opcua.DataType.Boolean);
            expect(callArgs.label).toBe('Boolean');
        });

        it('defaults initialValue to false when not provided', () => {
            createTag({
                namespace: fakeNamespace,
                device: fakeDevice,
                config: { type: 'boolean', browseName: 'Running', nodeId: 'ns=1;s=Running' },
            });

            const callArgs = mockedAddPrimitiveTag.mock.calls[0][0];
            expect(callArgs.initialValue).toBe(false);
        });

        it('uses provided initialValue when set', () => {
            createTag({
                namespace: fakeNamespace,
                device: fakeDevice,
                config: {
                    type: 'boolean',
                    browseName: 'Running',
                    nodeId: 'ns=1;s=Running',
                    initialValue: true,
                },
            });

            const callArgs = mockedAddPrimitiveTag.mock.calls[0][0];
            expect(callArgs.initialValue).toBe(true);
        });

        it('does not expose threshold support for boolean tags', () => {
            createTag({
                namespace: fakeNamespace,
                device: fakeDevice,
                config: {
                    type: 'boolean',
                    browseName: 'Running',
                    nodeId: 'ns=1;s=Running',
                    threshold: 0.5,
                } as any,
            });

            const callArgs = mockedAddPrimitiveTag.mock.calls[0][0];
            expect(callArgs.changeThreshold).toBeUndefined();
        });

        it('parser converts truthy/falsy values to boolean, defaulting to false', () => {
            createTag({
                namespace: fakeNamespace,
                device: fakeDevice,
                config: { type: 'boolean', browseName: 'Running', nodeId: 'ns=1;s=Running' },
            });

            const { parser } = mockedAddPrimitiveTag.mock.calls[0][0];
            expect(parser(1)).toBe(true);
            expect(parser(0)).toBe(false);
            expect(parser(undefined)).toBe(false);
            expect(parser(null)).toBe(false);
        });
    });

    describe('integer type', () => {
        it('calls addPrimitiveTag with correct dataType and valueType', () => {
            createTag({
                namespace: fakeNamespace,
                device: fakeDevice,
                config: { type: 'integer', browseName: 'Count', nodeId: 'ns=1;s=Count' },
            });

            const callArgs = mockedAddPrimitiveTag.mock.calls[0][0];
            expect(callArgs.dataType).toBe('Integer');
            expect(callArgs.valueType).toBe(opcua.DataType.Int32);
            expect(callArgs.label).toBe('Integer');
        });

        it('defaults initialValue to 0 when not provided', () => {
            createTag({
                namespace: fakeNamespace,
                device: fakeDevice,
                config: { type: 'integer', browseName: 'Count', nodeId: 'ns=1;s=Count' },
            });

            expect(mockedAddPrimitiveTag.mock.calls[0][0].initialValue).toBe(0);
        });

        it('parser truncates/parses numeric strings to integer', () => {
            createTag({
                namespace: fakeNamespace,
                device: fakeDevice,
                config: { type: 'integer', browseName: 'Count', nodeId: 'ns=1;s=Count' },
            });

            const { parser } = mockedAddPrimitiveTag.mock.calls[0][0];
            expect(parser('42')).toBe(42);
            expect(parser(42.9)).toBe(42);
            expect(parser(undefined)).toBe(0);
        });
        it('forwards threshold as changeThreshold when configured', () => {
            createTag({
                namespace: fakeNamespace,
                device: fakeDevice,
                config: {
                    type: 'integer',
                    browseName: 'Count',
                    nodeId: 'ns=1;s=Count',
                    threshold: 2,
                },
            });

            expect(mockedAddPrimitiveTag.mock.calls[0][0].changeThreshold).toBe(2);
        });

        it('changeThreshold is undefined when threshold is not provided', () => {
            createTag({
                namespace: fakeNamespace,
                device: fakeDevice,
                config: { type: 'integer', browseName: 'Count', nodeId: 'ns=1;s=Count' },
            });

            expect(mockedAddPrimitiveTag.mock.calls[0][0].changeThreshold).toBeUndefined();
        });

        it('forwards tagType (from config.type), deviceKey, and tagRuntime through to addPrimitiveTag (#40)', () => {
            const tagRuntime = { register: vi.fn(), recordChange: vi.fn() } as any;

            createTag({
                namespace: fakeNamespace,
                device: fakeDevice,
                config: { type: 'integer', browseName: 'Count', nodeId: 'ns=1;s=Count' },
                deviceKey: 'device1',
                tagRuntime,
            });

            const callArgs = mockedAddPrimitiveTag.mock.calls[0][0];
            expect(callArgs.tagType).toBe('integer');
            expect(callArgs.deviceKey).toBe('device1');
            expect(callArgs.tagRuntime).toBe(tagRuntime);
        });
    });

    describe('float type', () => {
        it('calls addPrimitiveTag with correct dataType and valueType', () => {
            createTag({
                namespace: fakeNamespace,
                device: fakeDevice,
                config: { type: 'float', browseName: 'Temp', nodeId: 'ns=1;s=Temp' },
            });

            const callArgs = mockedAddPrimitiveTag.mock.calls[0][0];
            expect(callArgs.dataType).toBe('Float');
            expect(callArgs.valueType).toBe(opcua.DataType.Float);
        });

        it('parser converts value to Number, defaulting to 0', () => {
            createTag({
                namespace: fakeNamespace,
                device: fakeDevice,
                config: { type: 'float', browseName: 'Temp', nodeId: 'ns=1;s=Temp' },
            });

            const { parser } = mockedAddPrimitiveTag.mock.calls[0][0];
            expect(parser('72.5')).toBe(72.5);
            expect(parser(undefined)).toBe(0);
        });

        it('forwards threshold as changeThreshold', () => {
            createTag({
                namespace: fakeNamespace,
                device: fakeDevice,
                config: {
                    type: 'float',
                    browseName: 'Temp',
                    nodeId: 'ns=1;s=Temp',
                    threshold: 0.1,
                },
            });

            expect(mockedAddPrimitiveTag.mock.calls[0][0].changeThreshold).toBe(0.1);
        });
    });

    describe('double type', () => {
        it('calls addPrimitiveTag with correct dataType and valueType', () => {
            createTag({
                namespace: fakeNamespace,
                device: fakeDevice,
                config: { type: 'double', browseName: 'Pressure', nodeId: 'ns=1;s=Pressure' },
            });

            const callArgs = mockedAddPrimitiveTag.mock.calls[0][0];
            expect(callArgs.dataType).toBe('Double');
            expect(callArgs.valueType).toBe(opcua.DataType.Double);
        });

        it('forwards threshold as changeThreshold', () => {
            createTag({
                namespace: fakeNamespace,
                device: fakeDevice,
                config: {
                    type: 'double',
                    browseName: 'Pressure',
                    nodeId: 'ns=1;s=Pressure',
                    threshold: 0.05,
                },
            });

            expect(mockedAddPrimitiveTag.mock.calls[0][0].changeThreshold).toBe(0.05);
        });
    });

    describe('string type', () => {
        it('calls addPrimitiveTag with correct dataType and valueType', () => {
            createTag({
                namespace: fakeNamespace,
                device: fakeDevice,
                config: { type: 'string', browseName: 'Status', nodeId: 'ns=1;s=Status' },
            });

            const callArgs = mockedAddPrimitiveTag.mock.calls[0][0];
            expect(callArgs.dataType).toBe('String');
            expect(callArgs.valueType).toBe(opcua.DataType.String);
        });

        it('defaults initialValue to empty string', () => {
            createTag({
                namespace: fakeNamespace,
                device: fakeDevice,
                config: { type: 'string', browseName: 'Status', nodeId: 'ns=1;s=Status' },
            });

            expect(mockedAddPrimitiveTag.mock.calls[0][0].initialValue).toBe('');
        });

        it('parser converts values to String, defaulting to empty string', () => {
            createTag({
                namespace: fakeNamespace,
                device: fakeDevice,
                config: { type: 'string', browseName: 'Status', nodeId: 'ns=1;s=Status' },
            });

            const { parser } = mockedAddPrimitiveTag.mock.calls[0][0];
            expect(parser(123)).toBe('123');
            expect(parser(undefined)).toBe('');
        });
    });

    describe('dateTime type', () => {
        it('calls addPrimitiveTag with correct dataType and valueType', () => {
            createTag({
                namespace: fakeNamespace,
                device: fakeDevice,
                config: { type: 'dateTime', browseName: 'LastUpdate', nodeId: 'ns=1;s=LastUpdate' },
            });

            const callArgs = mockedAddPrimitiveTag.mock.calls[0][0];
            expect(callArgs.dataType).toBe('DateTime');
            expect(callArgs.valueType).toBe(opcua.DataType.DateTime);
        });

        it('defaults initialValue to current date when not provided', () => {
            const before = Date.now();

            createTag({
                namespace: fakeNamespace,
                device: fakeDevice,
                config: { type: 'dateTime', browseName: 'LastUpdate', nodeId: 'ns=1;s=LastUpdate' },
            });

            const after = Date.now();
            const callArgs = mockedAddPrimitiveTag.mock.calls[0][0];

            expect(callArgs.initialValue).toBeInstanceOf(Date);
            const time = (callArgs.initialValue as Date).getTime();
            expect(time).toBeGreaterThanOrEqual(before);
            expect(time).toBeLessThanOrEqual(after);
        });

        it('uses provided initialValue converted to Date', () => {
            createTag({
                namespace: fakeNamespace,
                device: fakeDevice,
                config: {
                    type: 'dateTime',
                    browseName: 'LastUpdate',
                    nodeId: 'ns=1;s=LastUpdate',
                    initialValue: '2026-01-01T00:00:00.000Z',
                },
            });

            const callArgs = mockedAddPrimitiveTag.mock.calls[0][0];
            expect(callArgs.initialValue).toBeInstanceOf(Date);
            expect((callArgs.initialValue as Date).toISOString()).toBe('2026-01-01T00:00:00.000Z');
        });

        it('parser passes through an existing Date instance without re-wrapping incorrectly', () => {
            createTag({
                namespace: fakeNamespace,
                device: fakeDevice,
                config: { type: 'dateTime', browseName: 'LastUpdate', nodeId: 'ns=1;s=LastUpdate' },
            });

            const { parser } = mockedAddPrimitiveTag.mock.calls[0][0];
            const inputDate = new Date('2026-05-01T00:00:00.000Z') as Date;

            const result = parser(inputDate) as Date;
            expect(result).toBeInstanceOf(Date);
            expect(result.toISOString()).toBe('2026-05-01T00:00:00.000Z');
        });

        it('parser converts a string value to Date', () => {
            createTag({
                namespace: fakeNamespace,
                device: fakeDevice,
                config: { type: 'dateTime', browseName: 'LastUpdate', nodeId: 'ns=1;s=LastUpdate' },
            });

            const { parser } = mockedAddPrimitiveTag.mock.calls[0][0];
            const result = parser('2026-03-15T10:00:00.000Z') as Date;
            expect(result).toBeInstanceOf(Date);
            expect(result.toISOString()).toBe('2026-03-15T10:00:00.000Z');
        });

        it('parser defaults to current date when value is undefined', () => {
            createTag({
                namespace: fakeNamespace,
                device: fakeDevice,
                config: { type: 'dateTime', browseName: 'LastUpdate', nodeId: 'ns=1;s=LastUpdate' },
            });

            const { parser } = mockedAddPrimitiveTag.mock.calls[0][0];
            const before = Date.now();
            const result = parser(undefined) as Date;
            const after = Date.now();

            expect(result).toBeInstanceOf(Date);
            expect(result.getTime()).toBeGreaterThanOrEqual(before - 1000);
            expect(result.getTime()).toBeLessThanOrEqual(after + 1000);
        });
    });

    describe('unsupported type', () => {
        it('does not call addPrimitiveTag and logs a structured TagError', () => {
            createTag({
                namespace: fakeNamespace,
                device: fakeDevice,
                config: { type: 'unknownType', browseName: 'Weird' } as any,
            });

            expect(mockedAddPrimitiveTag).not.toHaveBeenCalled();
            expect(mockedLogger.error).toHaveBeenCalledTimes(1);

            const [payload] = mockedLogger.error.mock.calls[0];
            expect(payload.code).toBe(ErrorCode.TAG_TYPE_NOT_SUPPORTED);
            expect(payload.category).toBe('TagError');
            expect(payload.context).toEqual({ tagType: 'unknownType', browseName: 'Weird' });
        });
    });

    describe('metrics integration', () => {
        const makeFakeMetrics = () => ({
            recordTagCreated: vi.fn(),
            recordError: vi.fn(),
        }) as any;

        it('records a tag by type for each supported tag type', () => {
            const metrics = makeFakeMetrics();

            createTag({
                namespace: fakeNamespace,
                device: fakeDevice,
                config: { type: 'boolean', browseName: 'Running', nodeId: 'ns=1;s=Running' },
                metrics,
            });

            expect(metrics.recordTagCreated).toHaveBeenCalledWith('boolean');
            expect(metrics.recordError).not.toHaveBeenCalled();
        });

        it('records a TagError instead of a tag for an unsupported type', () => {
            const metrics = makeFakeMetrics();

            createTag({
                namespace: fakeNamespace,
                device: fakeDevice,
                config: { type: 'unknownType', browseName: 'Weird' } as any,
                metrics,
            });

            expect(metrics.recordError).toHaveBeenCalledWith('TagError');
            expect(metrics.recordTagCreated).not.toHaveBeenCalled();
        });

        it('does not throw when no metrics service is provided', () => {
            expect(() =>
                createTag({
                    namespace: fakeNamespace,
                    device: fakeDevice,
                    config: { type: 'boolean', browseName: 'Running', nodeId: 'ns=1;s=Running' },
                }),
            ).not.toThrow();
        });
    });
});