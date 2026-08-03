import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('node:fs', () => ({
    default: {
        statSync: vi.fn(),
        readFileSync: vi.fn(),
    },
    statSync: vi.fn(),
    readFileSync: vi.fn(),
}));

vi.mock('../../src/schemas/index.ts', () => ({
    DevicesSchema: {
        safeParse: vi.fn(),
    },
}));

vi.mock('../../src/infrastructure/logger/index.ts', () => ({
    createModuleLogger: () => ({
        warn: vi.fn(),
        error: vi.fn(),
        info: vi.fn(),
        debug: vi.fn(),
    }),
}));

import fs from 'node:fs';
import { readDevicesConfig } from '../../src/devices/config-reader.ts';
import { DevicesSchema } from '../../src/schemas/index.ts';

const mockedStatSync = vi.mocked(fs.statSync);
const mockedReadFileSync = vi.mocked(fs.readFileSync);
const mockedSafeParse = vi.mocked(DevicesSchema.safeParse);

beforeEach(() => {
    vi.clearAllMocks();
});

describe('readDevicesConfig', () => {
    it('returns null when no devices directory is found', () => {
        mockedStatSync.mockImplementation(() => {
            throw new Error('ENOENT');
        });

        const result = readDevicesConfig();

        expect(result).toBeNull();
        expect(mockedReadFileSync).not.toHaveBeenCalled();
    });

    it('falls back to the second candidate when the first does not exist', () => {
        mockedStatSync
            .mockImplementationOnce(() => {
                throw new Error('ENOENT');
            })
            .mockImplementationOnce(() => ({ isDirectory: () => true }) as any);
        mockedReadFileSync.mockReturnValue('{}');
        mockedSafeParse.mockReturnValue({ success: true, data: {} } as any);

        const result = readDevicesConfig();

        expect(mockedStatSync).toHaveBeenCalledTimes(2);
        expect(result).toEqual({});
    });

    it('returns null when the file cannot be read', () => {
        mockedStatSync.mockImplementationOnce(() => ({ isDirectory: () => true }) as any);
        mockedReadFileSync.mockImplementation(() => {
            throw new Error('EACCES');
        });

        const result = readDevicesConfig();

        expect(result).toBeNull();
        expect(mockedSafeParse).not.toHaveBeenCalled();
    });

    it('returns null when the file contains invalid JSON', () => {
        mockedStatSync.mockImplementationOnce(() => ({ isDirectory: () => true }) as any);
        mockedReadFileSync.mockReturnValue('{ not valid json');

        const result = readDevicesConfig();

        expect(result).toBeNull();
        expect(mockedSafeParse).not.toHaveBeenCalled();
    });

    it('returns null when schema validation fails', () => {
        mockedStatSync.mockImplementationOnce(() => ({ isDirectory: () => true }) as any);
        mockedReadFileSync.mockReturnValue('{"device1": {}}');
        mockedSafeParse.mockReturnValue({
            success: false,
            error: { issues: [{ path: ['device1', 'name'], message: 'Required' }] },
        } as any);

        const result = readDevicesConfig();

        expect(result).toBeNull();
    });

    it('returns the parsed data when validation succeeds', () => {
        mockedStatSync.mockImplementationOnce(() => ({ isDirectory: () => true }) as any);
        mockedReadFileSync.mockReturnValue('{}');

        const parsedDevices = {
            device1: { name: 'Motor1', nodeId: 'ns=1;s=Motor1', tags: [] },
        };
        mockedSafeParse.mockReturnValue({ success: true, data: parsedDevices } as any);

        const result = readDevicesConfig();

        expect(result).toEqual(parsedDevices);
    });

    describe('metrics integration', () => {
        const makeFakeMetrics = () => ({ recordError: vi.fn() }) as any;

        it('records a ConfigurationError when no devices directory is found', () => {
            mockedStatSync.mockImplementation(() => {
                throw new Error('ENOENT');
            });
            const metrics = makeFakeMetrics();

            readDevicesConfig(metrics);

            expect(metrics.recordError).toHaveBeenCalledWith('ConfigurationError');
        });

        it('records a ConfigurationError when the file cannot be read', () => {
            mockedStatSync.mockImplementationOnce(() => ({ isDirectory: () => true }) as any);
            mockedReadFileSync.mockImplementation(() => {
                throw new Error('EACCES');
            });
            const metrics = makeFakeMetrics();

            readDevicesConfig(metrics);

            expect(metrics.recordError).toHaveBeenCalledWith('ConfigurationError');
        });

        it('records a ValidationError when the file contains invalid JSON', () => {
            mockedStatSync.mockImplementationOnce(() => ({ isDirectory: () => true }) as any);
            mockedReadFileSync.mockReturnValue('{ not valid json');
            const metrics = makeFakeMetrics();

            readDevicesConfig(metrics);

            expect(metrics.recordError).toHaveBeenCalledWith('ValidationError');
        });

        it('records a ValidationError when schema validation fails', () => {
            mockedStatSync.mockImplementationOnce(() => ({ isDirectory: () => true }) as any);
            mockedReadFileSync.mockReturnValue('{"device1": {}}');
            mockedSafeParse.mockReturnValue({
                success: false,
                error: { issues: [{ path: ['device1', 'name'], message: 'Required' }] },
            } as any);
            const metrics = makeFakeMetrics();

            readDevicesConfig(metrics);

            expect(metrics.recordError).toHaveBeenCalledWith('ValidationError');
        });

        it('does not record any error when validation succeeds', () => {
            mockedStatSync.mockImplementationOnce(() => ({ isDirectory: () => true }) as any);
            mockedReadFileSync.mockReturnValue('{}');
            mockedSafeParse.mockReturnValue({ success: true, data: {} } as any);
            const metrics = makeFakeMetrics();

            readDevicesConfig(metrics);

            expect(metrics.recordError).not.toHaveBeenCalled();
        });

        it('does not throw when no metrics service is provided', () => {
            mockedStatSync.mockImplementation(() => {
                throw new Error('ENOENT');
            });

            expect(() => readDevicesConfig()).not.toThrow();
        });
    });
});