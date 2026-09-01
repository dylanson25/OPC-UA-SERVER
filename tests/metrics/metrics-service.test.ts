import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/infrastructure/logger/index.ts', () => ({
    createModuleLogger: () => ({
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
    }),
}));

import { MetricsService } from '../../src/metrics/metrics-service.ts';

function makeClock(start = 1_000_000) {
    let current = start;
    return {
        now: () => current,
        advance: (ms: number) => {
            current += ms;
        },
    };
}

beforeEach(() => {
    vi.clearAllMocks();
});

describe('MetricsService', () => {
    describe('getStatus', () => {
        it('starts in the "starting" status', () => {
            const metrics = new MetricsService();
            expect(metrics.getStatus().status).toBe('starting');
        });

        it('reflects status changes made via setStatus', () => {
            const metrics = new MetricsService();
            metrics.setStatus('running');
            expect(metrics.getStatus().status).toBe('running');

            metrics.setStatus('stopping');
            expect(metrics.getStatus().status).toBe('stopping');

            metrics.setStatus('stopped');
            expect(metrics.getStatus().status).toBe('stopped');
        });

        it('reports uptimeMs based on the injected clock', () => {
            const clock = makeClock();
            const metrics = new MetricsService({ now: clock.now });

            clock.advance(5000);

            expect(metrics.getStatus().uptimeMs).toBe(5000);
        });

        it('reports startTime as an ISO string', () => {
            const clock = makeClock(1_700_000_000_000);
            const metrics = new MetricsService({ now: clock.now });

            expect(metrics.getStatus().startTime).toBe(new Date(1_700_000_000_000).toISOString());
        });

        it('reports a version string', () => {
            const metrics = new MetricsService();
            expect(typeof metrics.getStatus().version).toBe('string');
            expect(metrics.getStatus().version.length).toBeGreaterThan(0);
        });

        it('degrades to "degraded" when running and a device is in error', () => {
            const metrics = new MetricsService();
            metrics.setStatus('running');
            metrics.recordDeviceError('plc1', 'PLC 1');

            expect(metrics.getStatus().status).toBe('degraded');
        });

        it('degrades to "degraded" when running and the error burst threshold is reached', () => {
            const metrics = new MetricsService({ degradedErrorThreshold: 3 });
            metrics.setStatus('running');

            metrics.recordError('DeviceError');
            metrics.recordError('DeviceError');
            expect(metrics.getStatus().status).toBe('running');

            metrics.recordError('DeviceError');
            expect(metrics.getStatus().status).toBe('degraded');
        });

        it('does not count errors outside the degraded window', () => {
            const clock = makeClock();
            const metrics = new MetricsService({
                now: clock.now,
                degradedErrorThreshold: 2,
                degradedWindowMs: 1000,
            });
            metrics.setStatus('running');

            metrics.recordError('DeviceError');
            clock.advance(2000);
            metrics.recordError('DeviceError');

            expect(metrics.getStatus().status).toBe('running');
        });

        it('does not report "degraded" when not "running" (e.g. "stopping" with a device in error)', () => {
            const metrics = new MetricsService();
            metrics.setStatus('stopping');
            metrics.recordDeviceError('plc1', 'PLC 1');

            expect(metrics.getStatus().status).toBe('stopping');
        });
    });

    describe('getDevices', () => {
        it('returns an empty list when no devices are tracked', () => {
            const metrics = new MetricsService();
            expect(metrics.getDevices()).toEqual({ total: 0, devices: [] });
        });

        it('tracks a connected device', () => {
            const metrics = new MetricsService();
            metrics.recordDeviceConnected('plc1', 'PLC 1');

            expect(metrics.getDevices()).toEqual({
                total: 1,
                devices: [{ id: 'plc1', name: 'PLC 1', status: 'connected' }],
            });
        });

        it('tracks a device in error separately from connected devices', () => {
            const metrics = new MetricsService();
            metrics.recordDeviceConnected('plc1', 'PLC 1');
            metrics.recordDeviceError('plc2', 'PLC 2');

            expect(metrics.getDevices().total).toBe(2);
            expect(metrics.getDevices().devices).toEqual(
                expect.arrayContaining([
                    { id: 'plc1', name: 'PLC 1', status: 'connected' },
                    { id: 'plc2', name: 'PLC 2', status: 'error' },
                ]),
            );
        });

        it('removes a device from the snapshot after recordDeviceRemoved', () => {
            const metrics = new MetricsService();
            metrics.recordDeviceConnected('plc1', 'PLC 1');
            metrics.recordDeviceRemoved('plc1');

            expect(metrics.getDevices()).toEqual({ total: 0, devices: [] });
        });

        it('recordDeviceError overwrites a previously connected status for the same id', () => {
            const metrics = new MetricsService();
            metrics.recordDeviceConnected('plc1', 'PLC 1');
            metrics.recordDeviceError('plc1', 'PLC 1');

            expect(metrics.getDevices().devices).toEqual([{ id: 'plc1', name: 'PLC 1', status: 'error' }]);
        });
    });

    describe('getTags', () => {
        it('returns zero counts for every type when no tags were recorded', () => {
            const metrics = new MetricsService();
            expect(metrics.getTags()).toEqual({
                total: 0,
                byType: { boolean: 0, integer: 0, float: 0, double: 0, string: 0, dateTime: 0 },
            });
        });

        it('counts tags by type', () => {
            const metrics = new MetricsService();
            metrics.recordTagCreated('boolean');
            metrics.recordTagCreated('boolean');
            metrics.recordTagCreated('float');

            expect(metrics.getTags()).toEqual({
                total: 3,
                byType: { boolean: 2, integer: 0, float: 1, double: 0, string: 0, dateTime: 0 },
            });
        });
    });

    describe('getSessions', () => {
        it('returns an empty list when there are no active sessions', () => {
            const metrics = new MetricsService();
            expect(metrics.getSessions()).toEqual({ active: 0, sessions: [] });
        });

        it('tracks an opened session with its clientName and connectedAt', () => {
            const clock = makeClock(1_700_000_000_000);
            const metrics = new MetricsService({ now: clock.now });

            metrics.recordSessionOpened('session-1', 'UaExpert');

            expect(metrics.getSessions()).toEqual({
                active: 1,
                sessions: [{ clientName: 'UaExpert', connectedAt: new Date(1_700_000_000_000).toISOString() }],
            });
        });

        it('removes a session after recordSessionClosed', () => {
            const metrics = new MetricsService();
            metrics.recordSessionOpened('session-1', 'UaExpert');
            metrics.recordSessionClosed('session-1');

            expect(metrics.getSessions()).toEqual({ active: 0, sessions: [] });
        });
    });

    describe('getErrors', () => {
        it('returns zero counts for every category when no errors were recorded', () => {
            const metrics = new MetricsService();
            expect(metrics.getErrors()).toEqual({
                total: 0,
                byCategory: {
                    ConfigurationError: 0,
                    ValidationError: 0,
                    DeviceError: 0,
                    TagError: 0,
                    ServerError: 0,
                    RuntimeError: 0,
                },
            });
        });

        it('counts errors by category and accumulates total', () => {
            const metrics = new MetricsService();
            metrics.recordError('DeviceError');
            metrics.recordError('DeviceError');
            metrics.recordError('ConfigurationError');

            const errors = metrics.getErrors();
            expect(errors.total).toBe(3);
            expect(errors.byCategory.DeviceError).toBe(2);
            expect(errors.byCategory.ConfigurationError).toBe(1);
        });

        it('error totals are cumulative and are not pruned by the degraded window', () => {
            const clock = makeClock();
            const metrics = new MetricsService({ now: clock.now, degradedWindowMs: 1000 });

            metrics.recordError('ServerError');
            clock.advance(10_000);

            expect(metrics.getErrors().total).toBe(1);
        });
    });

    describe('logSummary', () => {
        it('logs a structured summary at info level without throwing', () => {
            const metrics = new MetricsService();
            metrics.recordDeviceConnected('plc1', 'PLC 1');
            metrics.recordTagCreated('boolean');

            expect(() => metrics.logSummary()).not.toThrow();
        });
    });
});
