import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/devices/device-factory.ts', () => ({
    createDevice: vi.fn(),
}));

vi.mock('../../src/devices/config-reader.ts', () => ({
    readDevicesConfig: vi.fn(),
}));

vi.mock('../../src/infrastructure/logger/index.ts', () => ({
    createModuleLogger: () => ({
        warn: vi.fn(),
        error: vi.fn(),
        info: vi.fn(),
        debug: vi.fn(),
    }),
}));

import { DeviceManager } from '../../src/devices/device-manager.ts';
import { createDevice } from '../../src/devices/device-factory.ts';
import { readDevicesConfig } from '../../src/devices/config-reader.ts';
import type { DeviceConfig } from '../../src/types/index.ts';

const mockedCreateDevice = vi.mocked(createDevice);
const mockedReadDevicesConfig = vi.mocked(readDevicesConfig);

const fakeAddressSpace = {
    deleteNode: vi.fn(),
} as any;
const fakeNamespace = {} as any;

const makeConfig = (name: string, overrides = {}): DeviceConfig => ({
    name,
    nodeId: `ns=1;s=${name}`,
    tags: [],
    ...overrides,
});

beforeEach(() => {
    vi.clearAllMocks();
});

describe('DeviceManager', () => {
    describe('register', () => {
        it('calls createDevice with namespace and config', () => {
            const manager = new DeviceManager(fakeAddressSpace, fakeNamespace);
            const config = makeConfig('Motor1');

            manager.register('device1', config);

            expect(mockedCreateDevice).toHaveBeenCalledWith(fakeNamespace, config);
        });

        it('adds the device to the internal registry, visible via list()', () => {
            const manager = new DeviceManager(fakeAddressSpace, fakeNamespace);
            const config = makeConfig('Motor1');

            manager.register('device1', config);

            expect(manager.list()).toEqual([{ key: 'device1', config }]);
        });

        it('does not register a device with a duplicate key', () => {
            const manager = new DeviceManager(fakeAddressSpace, fakeNamespace);
            const config1 = makeConfig('Motor1');
            const config2 = makeConfig('Motor1-duplicate');

            manager.register('device1', config1);
            manager.register('device1', config2);

            expect(mockedCreateDevice).toHaveBeenCalledTimes(1);
            expect(manager.list()).toEqual([{ key: 'device1', config: config1 }]);
        });

        it('does not crash and skips the device when createDevice throws', () => {
            mockedCreateDevice.mockImplementationOnce(() => {
                throw new Error('node-opcua failed to create object');
            });

            const manager = new DeviceManager(fakeAddressSpace, fakeNamespace);
            const config = makeConfig('Motor1');

            expect(() => manager.register('device1', config)).not.toThrow();
            expect(manager.list()).toEqual([]);
        });

        it('still registers the remaining devices when one device fails to register', () => {
            mockedCreateDevice
                .mockImplementationOnce(() => {
                    throw new Error('node-opcua failed to create object');
                })
                .mockReturnValueOnce({ browseName: 'Motor2' } as any);

            const config1 = makeConfig('Motor1');
            const config2 = makeConfig('Motor2');
            const manager = new DeviceManager(fakeAddressSpace, fakeNamespace);

            manager.register('device1', config1);
            manager.register('device2', config2);

            expect(manager.list()).toEqual([{ key: 'device2', config: config2 }]);
        });
    });

    describe('load', () => {
        it('does nothing when readDevicesConfig returns null', () => {
            mockedReadDevicesConfig.mockReturnValue(null);

            const manager = new DeviceManager(fakeAddressSpace, fakeNamespace);
            manager.load();

            expect(mockedCreateDevice).not.toHaveBeenCalled();
            expect(manager.list()).toEqual([]);
        });

        it('registers every device returned by readDevicesConfig', () => {
            const config1 = makeConfig('Motor1');
            const config2 = makeConfig('Motor2');
            mockedReadDevicesConfig.mockReturnValue({
                device1: config1,
                device2: config2,
            });

            const manager = new DeviceManager(fakeAddressSpace, fakeNamespace);
            manager.load();

            expect(mockedCreateDevice).toHaveBeenCalledTimes(2);
            expect(manager.list()).toEqual(
                expect.arrayContaining([
                    { key: 'device1', config: config1 },
                    { key: 'device2', config: config2 },
                ]),
            );
        });
    });

    describe('remove', () => {
        it('returns false and does not call deleteNode when the key is unknown', () => {
            const manager = new DeviceManager(fakeAddressSpace, fakeNamespace);

            const result = manager.remove('nonexistent');

            expect(result).toBe(false);
            expect(fakeAddressSpace.deleteNode).not.toHaveBeenCalled();
        });

        it('calls addressSpace.deleteNode with the device node and removes it from the registry', () => {
            const fakeNode = { browseName: 'Motor1' };
            mockedCreateDevice.mockReturnValue(fakeNode as any);

            const manager = new DeviceManager(fakeAddressSpace, fakeNamespace);
            manager.register('device1', makeConfig('Motor1'));

            const result = manager.remove('device1');

            expect(result).toBe(true);
            expect(fakeAddressSpace.deleteNode).toHaveBeenCalledWith(fakeNode);
            expect(manager.list()).toEqual([]);
        });

        it('returns false and keeps the device registered if deleteNode throws', () => {
            const fakeNode = { browseName: 'Motor1' };
            mockedCreateDevice.mockReturnValue(fakeNode as any);
            fakeAddressSpace.deleteNode.mockImplementationOnce(() => {
                throw new Error('deleteNode failed');
            });

            const manager = new DeviceManager(fakeAddressSpace, fakeNamespace);
            const config = makeConfig('Motor1');
            manager.register('device1', config);

            const result = manager.remove('device1');

            expect(result).toBe(false);
            expect(manager.list()).toEqual([{ key: 'device1', config }]);
        });
    });

    describe('list', () => {
        it('returns an empty array when no devices are registered', () => {
            const manager = new DeviceManager(fakeAddressSpace, fakeNamespace);

            expect(manager.list()).toEqual([]);
        });

        it('returns all registered devices with their keys and configs', () => {
            const config1 = makeConfig('Motor1');
            const config2 = makeConfig('Motor2');

            const manager = new DeviceManager(fakeAddressSpace, fakeNamespace);
            manager.register('device1', config1);
            manager.register('device2', config2);

            expect(manager.list()).toEqual([
                { key: 'device1', config: config1 },
                { key: 'device2', config: config2 },
            ]);
        });
    });

    describe('reload', () => {
        it('does NOT remove existing devices when the new configuration is invalid', () => {
            mockedCreateDevice.mockReturnValue({ browseName: 'Motor1' } as any);

            const manager = new DeviceManager(fakeAddressSpace, fakeNamespace);
            const config = makeConfig('Motor1');
            manager.register('device1', config);

            mockedReadDevicesConfig.mockReturnValue(null);

            const result = manager.reload();

            expect(result).toBe(false);
            expect(fakeAddressSpace.deleteNode).not.toHaveBeenCalled();
            expect(manager.list()).toEqual([{ key: 'device1', config }]);
        });

        it('removes old devices and registers new ones when the new configuration is valid', () => {
            mockedCreateDevice.mockReturnValueOnce({ browseName: 'old' } as any);

            const manager = new DeviceManager(fakeAddressSpace, fakeNamespace);
            manager.register('device1', makeConfig('OldMotor'));

            const newConfig = makeConfig('NewMotor');
            mockedCreateDevice.mockReturnValueOnce({ browseName: 'new' } as any);
            mockedReadDevicesConfig.mockReturnValue({ device1: newConfig });

            const result = manager.reload();

            expect(result).toBe(true);
            expect(fakeAddressSpace.deleteNode).toHaveBeenCalledTimes(1);
            expect(manager.list()).toEqual([{ key: 'device1', config: newConfig }]);
        });

        it('works correctly when there are no devices registered yet', () => {
            mockedReadDevicesConfig.mockReturnValue({ device1: makeConfig('Motor1') });

            const manager = new DeviceManager(fakeAddressSpace, fakeNamespace);
            const result = manager.reload();

            expect(result).toBe(true);
            expect(fakeAddressSpace.deleteNode).not.toHaveBeenCalled();
            expect(mockedCreateDevice).toHaveBeenCalledTimes(1);
        });

        it('results in an empty device list if the new configuration is an empty object', () => {
            mockedCreateDevice.mockReturnValueOnce({ browseName: 'old' } as any);

            const manager = new DeviceManager(fakeAddressSpace, fakeNamespace);
            manager.register('device1', makeConfig('OldMotor'));

            mockedReadDevicesConfig.mockReturnValue({});

            const result = manager.reload();

            expect(result).toBe(true);
            expect(manager.list()).toEqual([]);
        });
    });
});