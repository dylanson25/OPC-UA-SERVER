import { createDevice } from './device-factory.ts';
import { readDevicesConfig } from './config-reader.ts';
import { createModuleLogger } from '../infrastructure/logger/index.ts';
import { DeviceError, ErrorCode, logAppError } from '../errors/index.ts';
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

        this.registerAll(config);
    }

    register(key: string, config: DeviceConfig): void {
        if (this.devices.has(key)) {
            logger.warn({ key }, 'Device already registered, skipping');
            return;
        }

        logger.info({ key, deviceName: config.name }, 'Registering device');

        let node: DeviceNode;
        try {
            node = createDevice(this.namespace, config);
        } catch (err) {
            logAppError(
                logger,
                new DeviceError(
                    ErrorCode.DEVICE_REGISTRATION_FAILED,
                    'Failed to register device',
                    { key, deviceName: config.name, err },
                ),
            );
            return;
        }

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

    /**
     * @returns true if the reload was applied, false if it was cancelled due to an invalid configuration.
     */
    reload(): boolean {
        logger.info('Reloading device configuration');

        const newConfig = readDevicesConfig();

        if (!newConfig) {
            logger.error(
                'Reload aborted: new configuration is invalid, existing devices remain unchanged',
            );
            return false;
        }

        for (const key of Array.from(this.devices.keys())) {
            this.remove(key);
        }

        this.registerAll(newConfig);

        logger.info({ deviceCount: this.devices.size }, 'Device configuration reloaded');
        return true;
    }

    private registerAll(config: Record<string, DeviceConfig>): void {
        for (const [key, deviceConfig] of Object.entries(config)) {
            this.register(key, deviceConfig);
        }
    }
}