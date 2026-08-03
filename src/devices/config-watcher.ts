import fs from 'node:fs';

import { getDevicesFilePath } from './config-reader.ts';
import { createModuleLogger } from '../infrastructure/logger/index.ts';
import type { DeviceManager } from './device-manager.ts';

const logger = createModuleLogger('address-space');

const DEFAULT_DEBOUNCE_MS = 300;

export class ConfigWatcher {
    private watcher: fs.FSWatcher | null = null;
    private debounceTimer: ReturnType<typeof setTimeout> | null = null;

    constructor(
        private readonly deviceManager: DeviceManager,
        private readonly debounceMs: number = DEFAULT_DEBOUNCE_MS,
    ) { }

    start(): void {
        if (this.watcher) {
            logger.warn('Config watcher already running');
            return;
        }

        const filePath = getDevicesFilePath();

        if (!filePath) {
            logger.warn('Cannot start config watcher: devices file not found');
            return;
        }

        try {
            this.watcher = fs.watch(filePath, (eventType) => {
                if (eventType === 'change') {
                    this.scheduleReload();
                }
            });

            this.watcher.on('error', (err) => {
                logger.error({ err, filePath }, 'Config watcher error');
            });

            logger.info({ filePath }, 'Watching device configuration for changes');
        } catch (err) {
            logger.error({ err, filePath }, 'Failed to start config watcher');
        }
    }

    stop(): void {
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
            this.debounceTimer = null;
        }

        if (this.watcher) {
            this.watcher.close();
            this.watcher = null;
            logger.info('Config watcher stopped');
        }
    }

    private scheduleReload(): void {
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
        }

        this.debounceTimer = setTimeout(() => {
            this.debounceTimer = null;
            this.performReload();
        }, this.debounceMs);
    }

    private performReload(): void {
        logger.info('Detected device configuration change, reloading...');

        const success = this.deviceManager.reload();

        if (success) {
            logger.info('Device configuration reload completed successfully');
        } else {
            logger.warn(
                'Device configuration reload skipped: new configuration was invalid, previous devices remain active',
            );
        }
    }
}