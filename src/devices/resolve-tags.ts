import { DeviceError, ErrorCode, RuntimeError, TagError } from '../errors/index.ts';
import type { DeviceConfig } from '../types/index.ts';
import type { ResolvedTag, TagSelector } from '../control/index.ts';

interface DeviceEntry {
    key: string;
    config: DeviceConfig;
}

function toResolved(key: string, config: DeviceConfig, tag: DeviceConfig['tags'][number]): ResolvedTag {
    return {
        device: key,
        deviceName: config.name,
        browseName: tag.browseName,
        nodeId: tag.nodeId,
        type: tag.type,
    };
}

/**
 * Resolves a `watch`/`get` selector (#40) against the running server's actual device
 * list — the `tags.resolve`/`tags.get` control-channel handlers' core logic, kept pure
 * and framework-free so it's cheap to unit test against plain `{key, config}[]` data
 * without booting a real OPCUAServerManager.
 *
 * Precedence mirrors src/cli/tag-selector.ts's validation:
 *   1. `nodeId` alone — a fully-qualified identifier, searched across every device.
 *   2. `device` (+ optional `tags` subset, or `browseName` to disambiguate) — scoped
 *      to that one device; with neither, every tag on the device.
 *   3. `browseName` alone — searched across every device; more than one match is
 *      reported as an ambiguity error listing every match, never guessed.
 */
export function resolveTagSelector(devices: DeviceEntry[], selector: TagSelector): ResolvedTag[] {
    const { device, nodeId, browseName, tags } = selector;

    if (nodeId) {
        for (const entry of devices) {
            const tag = entry.config.tags.find((t) => t.nodeId === nodeId);
            if (tag) return [toResolved(entry.key, entry.config, tag)];
        }
        throw new TagError(ErrorCode.TAG_NOT_FOUND, `No tag found with nodeId "${nodeId}"`, { nodeId });
    }

    if (device) {
        const entry = devices.find((d) => d.key === device);
        if (!entry) {
            throw new DeviceError(ErrorCode.DEVICE_NOT_FOUND, `No device found with key "${device}"`, { device });
        }

        if (tags && tags.length > 0) {
            const resolved: ResolvedTag[] = [];
            const missing: string[] = [];

            for (const name of tags) {
                const tag = entry.config.tags.find((t) => t.browseName === name);
                if (tag) resolved.push(toResolved(entry.key, entry.config, tag));
                else missing.push(name);
            }

            if (missing.length > 0) {
                throw new TagError(
                    ErrorCode.TAG_NOT_FOUND,
                    `Tag(s) not found on device "${device}": ${missing.join(', ')}`,
                    { device, missing },
                );
            }
            return resolved;
        }

        if (browseName) {
            const tag = entry.config.tags.find((t) => t.browseName === browseName);
            if (!tag) {
                throw new TagError(
                    ErrorCode.TAG_NOT_FOUND,
                    `No tag named "${browseName}" found on device "${device}"`,
                    { device, browseName },
                );
            }
            return [toResolved(entry.key, entry.config, tag)];
        }

        return entry.config.tags.map((tag) => toResolved(entry.key, entry.config, tag));
    }

    if (browseName) {
        const matches: ResolvedTag[] = [];
        for (const entry of devices) {
            for (const tag of entry.config.tags) {
                if (tag.browseName === browseName) matches.push(toResolved(entry.key, entry.config, tag));
            }
        }

        if (matches.length === 0) {
            throw new TagError(ErrorCode.TAG_NOT_FOUND, `No tag named "${browseName}" found on any device`, {
                browseName,
            });
        }

        if (matches.length > 1) {
            const list = matches.map((m) => `  ${m.device}.${m.browseName} (${m.nodeId})`).join('\n');
            throw new TagError(
                ErrorCode.TAG_BROWSE_NAME_AMBIGUOUS,
                `Multiple tags named "${browseName}" found — specify --device to disambiguate:\n${list}`,
                { browseName, matches },
            );
        }

        return matches;
    }

    // Unreachable via the CLI — src/cli/tag-selector.ts already requires one of
    // device/nodeId/browseName before a request is ever sent — guarded defensively for
    // any other future caller of this control-channel handler, per this codebase's
    // usual "log and continue"/"never silently misbehave" philosophy (see #33).
    throw new RuntimeError(
        ErrorCode.UNKNOWN_ERROR,
        'No tag selector provided: specify device, nodeId, or browseName',
    );
}
