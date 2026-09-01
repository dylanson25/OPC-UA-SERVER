import type { ServerStatus } from '../metrics/index.ts';
import type { TagType } from '../types/index.ts';

export interface ReloadResult {
    reloaded: true;
    deviceCount: number;
    devices: { key: string; name: string }[];
    added: string[];
    removed: string[];
}

export interface InfoResult {
    version: string;
    status: ServerStatus;
    uptimeMs: number;
    devices: number;
    tags: number;
    sessions: number;
}

/**
 * What `watch`/`get` (#40) send to the `tags.resolve`/`tags.get` handlers. Exactly
 * one of `device`/`nodeId`/`browseName` selects the tag(s) — `browseName` may combine
 * with `device` to disambiguate a name that matches tags on more than one device, and
 * `tags` (a device-scoped browse-name subset, `get` only) requires `device`. See
 * src/cli/tag-selector.ts for the mutual-exclusivity validation and
 * src/devices/resolve-tags.ts for how a selector is resolved against real devices.
 */
export interface TagSelector {
    device?: string;
    nodeId?: string;
    browseName?: string;
    tags?: string[];
}

/** A tag selector resolved against the running server's actual device configuration. */
export interface ResolvedTag {
    device: string;
    deviceName: string;
    browseName: string;
    nodeId: string;
    type: TagType;
}

/** `tags.get`'s response shape: a resolved tag plus its current value. */
export interface TagValue extends ResolvedTag {
    value: unknown;
}

/**
 * Published on the `tag-updates` channel (see ControlServer.publish) every time any
 * tag's value is written — significant or not. `watch` (#40) subscribes and filters
 * by `nodeId` (which tags it asked for) and `significant` (unless `--log-level trace`
 * asked for every update) rather than the server filtering per-subscriber.
 */
export interface TagChangeEvent extends ResolvedTag {
    oldValue: unknown;
    newValue: unknown;
    significant: boolean;
    timestamp: string;
}
