import fs from 'node:fs';
import path from 'node:path';

import { DevicesSchema } from '../schemas/index.ts';
import type { DeviceConfig } from '../types/index.ts';
import { createModuleLogger } from '../infrastructure/logger/index.ts';

const logger = createModuleLogger('address-space');

const candidates = [
    path.join(process.cwd(), 'src', 'devices'),
    path.join(process.cwd(), 'dist', 'devices'),
];

function findDevicesDirectory(): string | null {
    for (const c of candidates) {
        try {
            if (fs.statSync(c).isDirectory()) return c;
        } catch {
            // Ignore errors, just continue to the next candidate
        }
    }

    logger.warn({ candidates }, 'No devices directory found');
    return null;
}

export function readDevicesConfig(): Record<string, DeviceConfig> | null {
    const devicesPath = findDevicesDirectory();
    if (!devicesPath) return null;

    const devicesFile = path.join(devicesPath, 'devices.json');
    let raw: string;

    try {
        raw = fs.readFileSync(devicesFile, 'utf8');
    } catch (error) {
        logger.error({ file: path.basename(devicesFile), err: error }, 'Unable to read device file');
        return null;
    }

    let json: unknown;
    try {
        json = JSON.parse(raw);
    } catch (error) {
        logger.error({ file: path.basename(devicesFile), err: error }, 'Invalid JSON in device file');
        return null;
    }

    const parsed = DevicesSchema.safeParse(json);
    if (!parsed.success) {
        logger.error(
            { file: path.basename(devicesFile), issues: parsed.error.issues },
            'Invalid device configuration in file',
        );
        return null;
    }

    return parsed.data;
}