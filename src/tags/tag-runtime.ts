import { EventEmitter } from 'node:events';

import type { TagType } from '../types/index.ts';
import type { TagChangeEvent } from '../control/messages.ts';

interface TagRegistration {
    device: string;
    deviceName: string;
    browseName: string;
    nodeId: string;
    type: TagType;
    value: unknown;
}

/**
 * Live, in-process registry of every tag currently in the address space, plus a
 * change-event stream — the shared data source behind `opcua-server watch`/`get`
 * (#40). Populated/updated from the exact same `set()` closure in
 * src/tags/primitive.ts that already does deadband detection and debug/trace logging
 * (#36), so the CLI's view of "did this change" can never drift from what the server
 * itself logs — one `hasSignificantChange` call, consumed by both.
 *
 * Owned by OPCUAServerManager, threaded through DeviceManager -> createDevice ->
 * createTag -> addPrimitiveTag (optional at every layer, like MetricsService), and
 * forwarded onto the control channel's `tag-updates` event channel.
 */
export class TagRuntime extends EventEmitter {
    private readonly tags = new Map<string, TagRegistration>();

    register(registration: TagRegistration): void {
        this.tags.set(registration.nodeId, registration);
    }

    /** Called on DeviceManager.remove()/reload() so stale tags never satisfy tags.get. */
    unregisterDevice(device: string): void {
        for (const [nodeId, tag] of this.tags) {
            if (tag.device === device) this.tags.delete(nodeId);
        }
    }

    /** Current value for `tags.get` — instant, no need to wait for a change event. */
    getValue(nodeId: string): unknown {
        return this.tags.get(nodeId)?.value;
    }

    has(nodeId: string): boolean {
        return this.tags.has(nodeId);
    }

    /** Records the new current value and emits it — every write, significant or not. */
    recordChange(change: TagChangeEvent): void {
        const tag = this.tags.get(change.nodeId);
        if (tag) tag.value = change.newValue;
        this.emit('change', change);
    }

    onChange(listener: (change: TagChangeEvent) => void): void {
        this.on('change', listener);
    }
}
