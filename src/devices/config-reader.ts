import fs from 'node:fs';
import path from 'node:path';

import { DevicesSchema } from '../schemas/index.ts';
import type { DeviceConfig } from '../types/index.ts';
import { createModuleLogger } from '../infrastructure/logger/index.ts';
import { ConfigurationError, ErrorCode, ValidationError, logAppError } from '../errors/index.ts';
import type { MetricsService } from '../metrics/index.ts';

const logger = createModuleLogger('address-space');

const candidates = [
    path.join(process.cwd(), 'src', 'devices'),
    path.join(process.cwd(), 'dist', 'devices'),
];

export function findDevicesDirectory(metrics?: MetricsService): string | null {
    for (const c of candidates) {
        try {
            if (fs.statSync(c).isDirectory()) return c;
        } catch {
            // Ignore errors, just continue to the next candidate
        }
    }

    logAppError(
        logger,
        new ConfigurationError(
            ErrorCode.CONFIG_FILE_NOT_FOUND,
            'No devices directory found',
            { candidates },
        ),
    );
    metrics?.recordError('ConfigurationError');
    return null;
}

export function getDevicesFilePath(): string | null {
    const dir = findDevicesDirectory();
    if (!dir) return null;
    return path.join(dir, 'devices.json');
}

export function readDevicesConfig(metrics?: MetricsService): Record<string, DeviceConfig> | null {
    const devicesPath = findDevicesDirectory(metrics);
    if (!devicesPath) return null;

    const devicesFile = path.join(devicesPath, 'devices.json');
    let raw: string;

    try {
        raw = fs.readFileSync(devicesFile, 'utf8');
    } catch (error) {
        logAppError(
            logger,
            new ConfigurationError(
                ErrorCode.CONFIG_FILE_NOT_FOUND,
                'Unable to read device file',
                { file: path.basename(devicesFile), err: error },
            ),
        );
        metrics?.recordError('ConfigurationError');
        return null;
    }

    let json: unknown;
    try {
        json = JSON.parse(raw);
    } catch (error) {
        logAppError(
            logger,
            new ValidationError(
                ErrorCode.DEVICE_CONFIG_INVALID,
                `Path:\n${path.basename(devicesFile)}\n\nReason:\nInvalid JSON in device file`,
                { file: path.basename(devicesFile), err: error },
            ),
        );
        metrics?.recordError('ValidationError');
        return null;
    }

    const parsed = DevicesSchema.safeParse(json);
    if (!parsed.success) {
        logAppError(
            logger,
            ValidationError.fromZodError(parsed.error, { file: path.basename(devicesFile) }),
        );
        metrics?.recordError('ValidationError');
        return null;
    }

    return parsed.data;
}