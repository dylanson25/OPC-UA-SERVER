import { describe, it, expect, vi } from 'vitest';

import { TagRuntime } from '../../src/tags/tag-runtime.ts';

function makeChange(overrides: Partial<Parameters<TagRuntime['recordChange']>[0]> = {}) {
    return {
        device: 'PLC1',
        deviceName: 'PLC 1',
        browseName: 'Temperature',
        nodeId: 'ns=1;s=PLC1.Temperature',
        type: 'float' as const,
        oldValue: 20,
        newValue: 21,
        significant: true,
        timestamp: '2026-01-01T00:00:00.000Z',
        ...overrides,
    };
}

describe('TagRuntime', () => {
    it('has() is false and getValue() is undefined for a tag that was never registered', () => {
        const runtime = new TagRuntime();

        expect(runtime.has('ns=1;s=Unknown')).toBe(false);
        expect(runtime.getValue('ns=1;s=Unknown')).toBeUndefined();
    });

    it('register() makes the tag known and readable via getValue()', () => {
        const runtime = new TagRuntime();

        runtime.register({
            device: 'PLC1',
            deviceName: 'PLC 1',
            browseName: 'Temperature',
            nodeId: 'ns=1;s=PLC1.Temperature',
            type: 'float',
            value: 25.5,
        });

        expect(runtime.has('ns=1;s=PLC1.Temperature')).toBe(true);
        expect(runtime.getValue('ns=1;s=PLC1.Temperature')).toBe(25.5);
    });

    it('recordChange() updates the stored current value', () => {
        const runtime = new TagRuntime();
        runtime.register({
            device: 'PLC1',
            deviceName: 'PLC 1',
            browseName: 'Temperature',
            nodeId: 'ns=1;s=PLC1.Temperature',
            type: 'float',
            value: 25.5,
        });

        runtime.recordChange(makeChange({ oldValue: 25.5, newValue: 30 }));

        expect(runtime.getValue('ns=1;s=PLC1.Temperature')).toBe(30);
    });

    it('recordChange() emits a "change" event with the exact payload given', () => {
        const runtime = new TagRuntime();
        const listener = vi.fn();
        runtime.onChange(listener);

        const change = makeChange();
        runtime.recordChange(change);

        expect(listener).toHaveBeenCalledTimes(1);
        expect(listener).toHaveBeenCalledWith(change);
    });

    it('recordChange() still emits even for a tag that was never register()ed', () => {
        const runtime = new TagRuntime();
        const listener = vi.fn();
        runtime.onChange(listener);

        expect(() => runtime.recordChange(makeChange())).not.toThrow();
        expect(listener).toHaveBeenCalledTimes(1);
    });

    it('unregisterDevice() removes every tag belonging to that device, leaving others untouched', () => {
        const runtime = new TagRuntime();
        runtime.register({
            device: 'PLC1',
            deviceName: 'PLC 1',
            browseName: 'Temperature',
            nodeId: 'ns=1;s=PLC1.Temperature',
            type: 'float',
            value: 25.5,
        });
        runtime.register({
            device: 'PLC1',
            deviceName: 'PLC 1',
            browseName: 'CycleCount',
            nodeId: 'ns=1;s=PLC1.CycleCount',
            type: 'integer',
            value: 1,
        });
        runtime.register({
            device: 'PLC2',
            deviceName: 'PLC 2',
            browseName: 'Pump Running',
            nodeId: 'ns=1;s=PLC2.PumpRunning',
            type: 'boolean',
            value: true,
        });

        runtime.unregisterDevice('PLC1');

        expect(runtime.has('ns=1;s=PLC1.Temperature')).toBe(false);
        expect(runtime.has('ns=1;s=PLC1.CycleCount')).toBe(false);
        expect(runtime.has('ns=1;s=PLC2.PumpRunning')).toBe(true);
    });

    it('multiple onChange() listeners all receive the same event', () => {
        const runtime = new TagRuntime();
        const first = vi.fn();
        const second = vi.fn();
        runtime.onChange(first);
        runtime.onChange(second);

        runtime.recordChange(makeChange());

        expect(first).toHaveBeenCalledTimes(1);
        expect(second).toHaveBeenCalledTimes(1);
    });
});
