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

vi.mock('../../src/devices/device-factory.ts', () => ({
    createDevice: vi.fn(),
}));

vi.mock('../../src/infrastructure/logger/index.ts', () => ({
    createModuleLogger: () => ({
        warn: vi.fn(),
        info: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
    }),
}));

import fs from 'node:fs';
import { loadDevices } from '../../src/devices/device-loader.ts';
import { DevicesSchema } from '../../src/schemas/index.ts';
import { createDevice } from '../../src/devices/device-factory.ts';

const mockedStatSync = vi.mocked(fs.statSync);
const mockedReadFileSync = vi.mocked(fs.readFileSync);
const mockedSafeParse = vi.mocked(DevicesSchema.safeParse);
const mockedCreateDevice = vi.mocked(createDevice);

const fakeAddressSpace = {} as any;
const fakeNamespace = {} as any;

beforeEach(() => {
    vi.clearAllMocks();
});

describe('loadDevices', () => {
    it('logs a warning and does nothing when no devices directory is found', () => {
        mockedStatSync.mockImplementation(() => {
            throw new Error('ENOENT');
        });

        loadDevices(fakeAddressSpace, fakeNamespace);

        expect(mockedReadFileSync).not.toHaveBeenCalled();
        expect(mockedCreateDevice).not.toHaveBeenCalled();
    });

    it('uses the first candidate directory when it exists', () => {
        mockedStatSync.mockImplementationOnce(() => ({ isDirectory: () => true }) as any);
        mockedReadFileSync.mockReturnValue('{}');
        mockedSafeParse.mockReturnValue({ success: true, data: {} } as any);

        loadDevices(fakeAddressSpace, fakeNamespace);

        expect(mockedStatSync).toHaveBeenCalledTimes(1);
        expect(mockedReadFileSync).toHaveBeenCalledTimes(1);
    });

    it('falls back to the second candidate when the first does not exist', () => {
        mockedStatSync
            .mockImplementationOnce(() => {
                throw new Error('ENOENT');
            })
            .mockImplementationOnce(() => ({ isDirectory: () => true }) as any);
        mockedReadFileSync.mockReturnValue('{}');
        mockedSafeParse.mockReturnValue({ success: true, data: {} } as any);

        loadDevices(fakeAddressSpace, fakeNamespace);

        expect(mockedStatSync).toHaveBeenCalledTimes(2);
        expect(mockedReadFileSync).toHaveBeenCalledTimes(1);
    });

    it('logs an error and stops when the devices file cannot be read', () => {
        mockedStatSync.mockImplementationOnce(() => ({ isDirectory: () => true }) as any);
        mockedReadFileSync.mockImplementation(() => {
            throw new Error('EACCES');
        });

        loadDevices(fakeAddressSpace, fakeNamespace);

        expect(mockedSafeParse).not.toHaveBeenCalled();
        expect(mockedCreateDevice).not.toHaveBeenCalled();
    });

    it('logs an error and stops when the file contains invalid JSON', () => {
        mockedStatSync.mockImplementationOnce(() => ({ isDirectory: () => true }) as any);
        mockedReadFileSync.mockReturnValue('{ not valid json');

        loadDevices(fakeAddressSpace, fakeNamespace);

        expect(mockedSafeParse).not.toHaveBeenCalled();
        expect(mockedCreateDevice).not.toHaveBeenCalled();
    });

    it('logs an error and stops when schema validation fails', () => {
        mockedStatSync.mockImplementationOnce(() => ({ isDirectory: () => true }) as any);
        mockedReadFileSync.mockReturnValue('{"device1": {}}');
        mockedSafeParse.mockReturnValue({
            success: false,
            error: { issues: [{ path: ['device1', 'name'], message: 'Required' }] },
        } as any);

        loadDevices(fakeAddressSpace, fakeNamespace);

        expect(mockedCreateDevice).not.toHaveBeenCalled();
    });

    it('calls createDevice once per device when validation succeeds', () => {
        mockedStatSync.mockImplementationOnce(() => ({ isDirectory: () => true }) as any);
        mockedReadFileSync.mockReturnValue('{}');

        const parsedDevices = {
            device1: { name: 'Motor1', nodeId: 'ns=1;s=Motor1', tags: [] },
            device2: { name: 'Motor2', nodeId: 'ns=1;s=Motor2', tags: [] },
        };
        mockedSafeParse.mockReturnValue({ success: true, data: parsedDevices } as any);

        loadDevices(fakeAddressSpace, fakeNamespace);

        expect(mockedCreateDevice).toHaveBeenCalledTimes(2);
        expect(mockedCreateDevice).toHaveBeenCalledWith(fakeNamespace, parsedDevices.device1);
        expect(mockedCreateDevice).toHaveBeenCalledWith(fakeNamespace, parsedDevices.device2);
    });

    it('does not call createDevice when the parsed devices object is empty', () => {
        mockedStatSync.mockImplementationOnce(() => ({ isDirectory: () => true }) as any);
        mockedReadFileSync.mockReturnValue('{}');
        mockedSafeParse.mockReturnValue({ success: true, data: {} } as any);

        loadDevices(fakeAddressSpace, fakeNamespace);

        expect(mockedCreateDevice).not.toHaveBeenCalled();
    });

    it('passes the namespace argument through to createDevice, not addressSpace', () => {
        mockedStatSync.mockImplementationOnce(() => ({ isDirectory: () => true }) as any);
        mockedReadFileSync.mockReturnValue('{}');

        const parsedDevices = {
            device1: { name: 'Motor1', nodeId: 'ns=1;s=Motor1', tags: [] },
        };
        mockedSafeParse.mockReturnValue({ success: true, data: parsedDevices } as any);

        loadDevices(fakeAddressSpace, fakeNamespace);

        const [namespaceArg] = mockedCreateDevice.mock.calls[0];
        expect(namespaceArg).toBe(fakeNamespace);
        expect(namespaceArg).not.toBe(fakeAddressSpace);
    });
});