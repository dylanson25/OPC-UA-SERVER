import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/tags/factory.ts', () => ({
    createTag: vi.fn(),
}));

import { createDevice } from '../../src/devices/device-factory.ts';
import { createTag } from '../../src/tags/factory.ts';
import type { DeviceConfig, NamespaceLike } from '../../src/types/index.ts';

const mockedCreateTag = vi.mocked(createTag);

function makeFakeNamespace(addObjectReturn: unknown = {}): NamespaceLike {
    return {
        addObject: vi.fn().mockReturnValue(addObjectReturn),
    } as unknown as NamespaceLike;
}

const validTag = (overrides = {}) => ({
    type: 'integer' as const,
    browseName: 'Tag1',
    nodeId: 'ns=1;s=Tag1',
    ...overrides,
});

beforeEach(() => {
    mockedCreateTag.mockClear();
});

describe('createDevice', () => {
    it('calls namespace.addObject with correct browseName and organizedBy', () => {
        const namespace = makeFakeNamespace();
        const config: DeviceConfig = {
            name: 'Motor1',
            nodeId: 'ns=1;s=Motor1',
            tags: [validTag()],
        };

        createDevice(namespace, config);

        expect(namespace.addObject).toHaveBeenCalledTimes(1);
        expect(namespace.addObject).toHaveBeenCalledWith({
            browseName: 'Motor1',
            organizedBy: 'ObjectsFolder',
        });
    });

    it('returns the object created by namespace.addObject', () => {
        const fakeDeviceObject = { browseName: 'Motor1', nodeId: 'ns=1;s=Motor1' };
        const namespace = makeFakeNamespace(fakeDeviceObject);
        const config: DeviceConfig = {
            name: 'Motor1',
            nodeId: 'ns=1;s=Motor1',
            tags: [validTag()],
        };

        const result = createDevice(namespace, config);

        expect(result).toBe(fakeDeviceObject);
    });

    it('calls createTag once per tag in config', () => {
        const namespace = makeFakeNamespace();
        const config: DeviceConfig = {
            name: 'Motor1',
            nodeId: 'ns=1;s=Motor1',
            tags: [
                validTag({ browseName: 'Tag1', nodeId: 'ns=1;s=Tag1' }),
                validTag({ browseName: 'Tag2', nodeId: 'ns=1;s=Tag2' }),
                validTag({ browseName: 'Tag3', nodeId: 'ns=1;s=Tag3' }),
            ],
        };

        createDevice(namespace, config);

        expect(mockedCreateTag).toHaveBeenCalledTimes(3);
    });

    it('passes namespace, device, and each tag config to createTag', () => {
        const fakeDeviceObject = { browseName: 'Motor1' };
        const namespace = makeFakeNamespace(fakeDeviceObject);
        const tag1 = validTag({ browseName: 'Tag1', nodeId: 'ns=1;s=Tag1' });
        const config: DeviceConfig = {
            name: 'Motor1',
            nodeId: 'ns=1;s=Motor1',
            tags: [tag1],
        };

        createDevice(namespace, config);

        expect(mockedCreateTag).toHaveBeenCalledWith({
            namespace,
            device: fakeDeviceObject,
            config: tag1,
        });
    });

    it('does not call createTag when tags array is empty', () => {
        const namespace = makeFakeNamespace();
        const config: DeviceConfig = {
            name: 'Motor1',
            nodeId: 'ns=1;s=Motor1',
            tags: [],
        };

        createDevice(namespace, config);

        expect(mockedCreateTag).not.toHaveBeenCalled();
    });

    it('creates the device object even when tags array is empty', () => {
        const namespace = makeFakeNamespace();
        const config: DeviceConfig = {
            name: 'Motor1',
            nodeId: 'ns=1;s=Motor1',
            tags: [],
        };

        createDevice(namespace, config);

        expect(namespace.addObject).toHaveBeenCalledTimes(1);
    });

    it('calls createTag with the same device reference for all tags of the device', () => {
        const fakeDeviceObject = { browseName: 'Motor1' };
        const namespace = makeFakeNamespace(fakeDeviceObject);
        const config: DeviceConfig = {
            name: 'Motor1',
            nodeId: 'ns=1;s=Motor1',
            tags: [
                validTag({ browseName: 'Tag1', nodeId: 'ns=1;s=Tag1' }),
                validTag({ browseName: 'Tag2', nodeId: 'ns=1;s=Tag2' }),
            ],
        };

        createDevice(namespace, config);

        const devicesPassed = mockedCreateTag.mock.calls.map((call) => call[0].device);
        expect(devicesPassed[0]).toBe(fakeDeviceObject);
        expect(devicesPassed[1]).toBe(fakeDeviceObject);
        expect(devicesPassed[0]).toBe(devicesPassed[1]);
    });
});