import { createDevice } from './device-factory.ts';
import { readDevicesConfig } from './config-reader.ts';
import { createModuleLogger } from '../infrastructure/logger/index.ts';
import type { AddressSpaceLike, NamespaceLike, DeviceConfig } from '../types/index.ts';

const logger = createModuleLogger('address-space');

type DeviceNode = ReturnType<typeof createDevice>;

interface DeviceEntry {
    config: DeviceConfig;
    node: DeviceNode;
}

export class DeviceManager {
    private readonly devices = new Map<string, DeviceEntry>();

    constructor(
        private readonly addressSpace: AddressSpaceLike,
        private readonly namespace: NamespaceLike,
    ) { }

    load(): void {
        const config = readDevicesConfig();

        if (!config) {
            logger.warn('No device configuration to load');
            return;
        }

        for (const [key, deviceConfig] of Object.entries(config)) {
            this.register(key, deviceConfig);
        }
    }

    register(key: string, config: DeviceConfig): void {
        if (this.devices.has(key)) {
            logger.warn({ key }, 'Device already registered, skipping');
            return;
        }

        logger.info({ key, deviceName: config.name }, 'Registering device');

        const node = createDevice(this.namespace, config);
        this.devices.set(key, { config, node });
    }

    remove(key: string): boolean {
        const entry = this.devices.get(key);

        if (!entry) {
            logger.warn({ key }, 'Attempted to remove unknown device');
            return false;
        }

        try {
            this.addressSpace.deleteNode(entry.node);
        } catch (err) {
            logger.error({ key, err }, 'Error removing device node from address space');
            return false;
        }

        this.devices.delete(key);
        logger.info({ key }, 'Device removed');
        return true;
    }

    list(): { key: string; config: DeviceConfig }[] {
        return Array.from(this.devices.entries()).map(([key, entry]) => ({
            key,
            config: entry.config,
        }));
    }

    reload(): void {
        logger.info('Reloading device configuration');

        for (const key of Array.from(this.devices.keys())) {
            this.remove(key);
        }

        this.load();
    }
}