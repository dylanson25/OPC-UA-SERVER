import { describe, it, expect } from 'vitest';

import { resolveTagSelector } from '../../src/devices/resolve-tags.ts';
import { ErrorCode } from '../../src/errors/index.ts';
import type { DeviceConfig } from '../../src/types/index.ts';

const plc1: DeviceConfig = {
    name: 'PLC 1',
    nodeId: 'ns=1;s=PLC1',
    tags: [
        { type: 'float', browseName: 'Temperature', nodeId: 'ns=1;s=PLC1.Temperature' },
        { type: 'integer', browseName: 'CycleCount', nodeId: 'ns=1;s=PLC1.CycleCount' },
        { type: 'boolean', browseName: 'HomeSwitchStatus', nodeId: 'ns=1;s=PLC1.HomeSwitchStatus' },
    ],
};

const plc2: DeviceConfig = {
    name: 'PLC 2',
    nodeId: 'ns=1;s=PLC2',
    // Deliberately shares a browse name with PLC1, to exercise ambiguity resolution.
    tags: [{ type: 'float', browseName: 'Temperature', nodeId: 'ns=1;s=PLC2.Temperature' }],
};

const devices = [
    { key: 'PLC1', config: plc1 },
    { key: 'PLC2', config: plc2 },
];

describe('resolveTagSelector', () => {
    describe('by nodeId', () => {
        it('resolves the single tag with a matching nodeId, searched across every device', () => {
            const result = resolveTagSelector(devices, { nodeId: 'ns=1;s=PLC2.Temperature' });

            expect(result).toEqual([
                { device: 'PLC2', deviceName: 'PLC 2', browseName: 'Temperature', nodeId: 'ns=1;s=PLC2.Temperature', type: 'float' },
            ]);
        });

        it('throws TAG_NOT_FOUND for an unknown nodeId', () => {
            expect(() => resolveTagSelector(devices, { nodeId: 'ns=9;s=Nope' })).toThrowError(
                expect.objectContaining({ code: ErrorCode.TAG_NOT_FOUND }),
            );
        });

        it('ignores device/browseName/tags when nodeId is given (nodeId wins)', () => {
            const result = resolveTagSelector(devices, {
                nodeId: 'ns=1;s=PLC1.CycleCount',
                device: 'PLC2',
                browseName: 'Temperature',
            });

            expect(result).toEqual([
                { device: 'PLC1', deviceName: 'PLC 1', browseName: 'CycleCount', nodeId: 'ns=1;s=PLC1.CycleCount', type: 'integer' },
            ]);
        });
    });

    describe('by device (whole device)', () => {
        it('resolves every tag on the device when neither browseName nor tags is given', () => {
            const result = resolveTagSelector(devices, { device: 'PLC1' });

            expect(result).toHaveLength(3);
            expect(result.map((t) => t.browseName)).toEqual(
                expect.arrayContaining(['Temperature', 'CycleCount', 'HomeSwitchStatus']),
            );
            expect(result.every((t) => t.device === 'PLC1')).toBe(true);
        });

        it('throws DEVICE_NOT_FOUND for an unknown device key', () => {
            expect(() => resolveTagSelector(devices, { device: 'NOPE' })).toThrowError(
                expect.objectContaining({ code: ErrorCode.DEVICE_NOT_FOUND }),
            );
        });
    });

    describe('by device + browseName (disambiguation)', () => {
        it('resolves the one matching tag scoped to that device, even though the name is ambiguous globally', () => {
            const result = resolveTagSelector(devices, { device: 'PLC2', browseName: 'Temperature' });

            expect(result).toEqual([
                { device: 'PLC2', deviceName: 'PLC 2', browseName: 'Temperature', nodeId: 'ns=1;s=PLC2.Temperature', type: 'float' },
            ]);
        });

        it('throws TAG_NOT_FOUND when the browse name does not exist on that device', () => {
            expect(() =>
                resolveTagSelector(devices, { device: 'PLC1', browseName: 'DoesNotExist' }),
            ).toThrowError(expect.objectContaining({ code: ErrorCode.TAG_NOT_FOUND }));
        });
    });

    describe('by device + tags (subset)', () => {
        it('resolves exactly the requested browse names, scoped to the device', () => {
            const result = resolveTagSelector(devices, { device: 'PLC1', tags: ['Temperature', 'CycleCount'] });

            expect(result.map((t) => t.browseName)).toEqual(['Temperature', 'CycleCount']);
            expect(result.every((t) => t.device === 'PLC1')).toBe(true);
        });

        it('throws TAG_NOT_FOUND listing every missing tag when some are not found', () => {
            expect(() =>
                resolveTagSelector(devices, { device: 'PLC1', tags: ['Temperature', 'Nope1', 'Nope2'] }),
            ).toThrowError(
                expect.objectContaining({
                    code: ErrorCode.TAG_NOT_FOUND,
                    message: expect.stringContaining('Nope1, Nope2'),
                }),
            );
        });
    });

    describe('by browseName only (across all devices)', () => {
        it('resolves the single match when the browse name is unique', () => {
            const result = resolveTagSelector(devices, { browseName: 'CycleCount' });

            expect(result).toEqual([
                { device: 'PLC1', deviceName: 'PLC 1', browseName: 'CycleCount', nodeId: 'ns=1;s=PLC1.CycleCount', type: 'integer' },
            ]);
        });

        it('throws TAG_NOT_FOUND when no device has a tag with that browse name', () => {
            expect(() => resolveTagSelector(devices, { browseName: 'Nope' })).toThrowError(
                expect.objectContaining({ code: ErrorCode.TAG_NOT_FOUND }),
            );
        });

        it('throws TAG_BROWSE_NAME_AMBIGUOUS listing every match when more than one device has that tag', () => {
            expect(() => resolveTagSelector(devices, { browseName: 'Temperature' })).toThrowError(
                expect.objectContaining({
                    code: ErrorCode.TAG_BROWSE_NAME_AMBIGUOUS,
                    message: expect.stringContaining('PLC1.Temperature'),
                    context: expect.objectContaining({
                        matches: expect.arrayContaining([
                            expect.objectContaining({ device: 'PLC1' }),
                            expect.objectContaining({ device: 'PLC2' }),
                        ]),
                    }),
                }),
            );
        });

        it("the ambiguity message also lists PLC2's match, and names --device as the fix", () => {
            try {
                resolveTagSelector(devices, { browseName: 'Temperature' });
                expect.unreachable('expected resolveTagSelector to throw');
            } catch (err) {
                const message = (err as Error).message;
                expect(message).toContain('PLC2.Temperature');
                expect(message).toContain('--device');
            }
        });
    });

    describe('no selector at all', () => {
        it('throws rather than silently resolving nothing (defensive — the CLI never sends this)', () => {
            expect(() => resolveTagSelector(devices, {})).toThrow();
        });
    });
});
