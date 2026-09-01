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
    // Docker volume-mount convention (`-v ./devices:/app/devices`): checked before the
    // image's own baked-in default at dist/devices so a mounted override wins.
    path.join(process.cwd(), 'devices'),
    path.join(process.cwd(), 'dist', 'devices'),
];

/**
 * CLI `start --config <path>` (and #37-40) set this before the app initializes, so it
 * takes priority over the directory-candidate search below — an explicit file path,
 * not a directory. Purely in-memory: never read from or written to any config file.
 */
function explicitConfigPathOverride(): string | null {
    return process.env.DEVICES_CONFIG_PATH || null;
}

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
    const override = explicitConfigPathOverride();
    if (override) return override;

    const dir = findDevicesDirectory();
    if (!dir) return null;
    return path.join(dir, 'devices.json');
}

/**
 * Reads, parses, and schema-validates a devices.json-shaped file at an exact path —
 * the one place this logic lives, shared by readDevicesConfig() (the live server,
 * which logs and swallows failures below) and validateDevicesConfigFile() (the CLI
 * `validate` command, which needs the actual structured error to report to the user).
 *
 * Deliberately has no explicit return-type annotation: TS's control-flow narrowing on
 * `result.ok` (see call sites below) breaks when a function returning object literals
 * is annotated with a separately-declared discriminated-union type — confirmed via an
 * isolated repro against this exact TS version. Letting the return type be inferred
 * (with `as const` on each `ok` literal) avoids it; `ReadResult` below derives the
 * public type from that inference instead of the other way around.
 */
function readAndValidateDevicesFile(filePath: string) {
    let raw: string;

    try {
        raw = fs.readFileSync(filePath, 'utf8');
    } catch (error) {
        return {
            ok: false as const,
            error: new ConfigurationError(
                ErrorCode.CONFIG_FILE_NOT_FOUND,
                'Unable to read device file',
                { file: path.basename(filePath), err: error },
            ),
        };
    }

    let json: unknown;
    try {
        json = JSON.parse(raw);
    } catch (error) {
        return {
            ok: false as const,
            error: new ValidationError(
                ErrorCode.DEVICE_CONFIG_INVALID,
                `Path:\n${path.basename(filePath)}\n\nReason:\nInvalid JSON in device file`,
                { file: path.basename(filePath), err: error },
            ),
        };
    }

    const parsed = DevicesSchema.safeParse(json);
    if (!parsed.success) {
        return {
            ok: false as const,
            error: ValidationError.fromZodError(parsed.error, { file: path.basename(filePath) }),
        };
    }

    return { ok: true as const, data: parsed.data };
}

export type ReadResult = ReturnType<typeof readAndValidateDevicesFile>;

/**
 * Validates a devices.json-shaped file at an explicit path without logging or touching
 * metrics — used by the CLI's `validate` command (and by `start --config`, indirectly,
 * via readDevicesConfig() below), so error reporting is identical everywhere.
 */
export function validateDevicesConfigFile(filePath: string): ReadResult {
    return readAndValidateDevicesFile(filePath);
}

export function readDevicesConfig(metrics?: MetricsService): Record<string, DeviceConfig> | null {
    const override = explicitConfigPathOverride();
    const devicesFile = override ?? (() => {
        const devicesPath = findDevicesDirectory(metrics);
        return devicesPath ? path.join(devicesPath, 'devices.json') : null;
    })();

    if (!devicesFile) return null;

    const result = readAndValidateDevicesFile(devicesFile);

    if (!result.ok) {
        logAppError(logger, result.error);
        metrics?.recordError(result.error instanceof ValidationError ? 'ValidationError' : 'ConfigurationError');
        return null;
    }

    return result.data;
}
