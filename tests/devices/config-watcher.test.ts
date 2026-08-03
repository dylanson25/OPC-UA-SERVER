import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('node:fs', () => ({
    default: { watch: vi.fn() },
    watch: vi.fn(),
}));

vi.mock('../../src/devices/config-reader.ts', () => ({
    getDevicesFilePath: vi.fn(),
}));

vi.mock('../../src/infrastructure/logger/index.ts', () => ({
    createModuleLogger: () => ({
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
    }),
}));

import fs from 'node:fs';
import { ConfigWatcher } from '../../src/devices/config-watcher.ts';
import { getDevicesFilePath } from '../../src/devices/config-reader.ts';

const mockedWatch = vi.mocked(fs.watch);
const mockedGetDevicesFilePath = vi.mocked(getDevicesFilePath);

function makeFakeFsWatcher() {
    const listeners: Record<string, (...args: any[]) => void> = {};

    return {
        close: vi.fn(),
        on: vi.fn((event: string, cb: (...args: any[]) => void) => {
            listeners[event] = cb;
        }),
        _listeners: listeners,
    };
}

function makeFakeDeviceManager() {
    return {
        reload: vi.fn().mockReturnValue(true),
    } as any;
}

beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
});

afterEach(() => {
    vi.useRealTimers();
});

describe('ConfigWatcher', () => {
    describe('start', () => {
        it('does not start watching when no devices file path is found', () => {
            mockedGetDevicesFilePath.mockReturnValue(null);
            const deviceManager = makeFakeDeviceManager();

            const watcher = new ConfigWatcher(deviceManager);
            watcher.start();

            expect(mockedWatch).not.toHaveBeenCalled();
        });

        it('calls fs.watch with the resolved devices file path', () => {
            mockedGetDevicesFilePath.mockReturnValue('/app/src/devices/devices.json');
            const fakeFsWatcher = makeFakeFsWatcher();
            mockedWatch.mockReturnValue(fakeFsWatcher as any);
            const deviceManager = makeFakeDeviceManager();

            const watcher = new ConfigWatcher(deviceManager);
            watcher.start();

            expect(mockedWatch).toHaveBeenCalledWith(
                '/app/src/devices/devices.json',
                expect.any(Function),
            );
        });

        it('does not start a second watcher if already running', () => {
            mockedGetDevicesFilePath.mockReturnValue('/app/src/devices/devices.json');
            mockedWatch.mockReturnValue(makeFakeFsWatcher() as any);
            const deviceManager = makeFakeDeviceManager();

            const watcher = new ConfigWatcher(deviceManager);
            watcher.start();
            watcher.start();

            expect(mockedWatch).toHaveBeenCalledTimes(1);
        });
    });

    describe('change detection and debounce', () => {
        it('calls deviceManager.reload() after the debounce period on a change event', () => {
            mockedGetDevicesFilePath.mockReturnValue('/app/src/devices/devices.json');
            const fakeFsWatcher = makeFakeFsWatcher();
            let watchCallback: (eventType: string) => void = () => { };
            mockedWatch.mockImplementation((_path, cb) => {
                watchCallback = cb as any;
                return fakeFsWatcher as any;
            });
            const deviceManager = makeFakeDeviceManager();

            const watcher = new ConfigWatcher(deviceManager, 300);
            watcher.start();

            watchCallback('change');
            expect(deviceManager.reload).not.toHaveBeenCalled();

            vi.advanceTimersByTime(300);
            expect(deviceManager.reload).toHaveBeenCalledTimes(1);
        });

        it('debounces multiple rapid change events into a single reload', () => {
            mockedGetDevicesFilePath.mockReturnValue('/app/src/devices/devices.json');
            let watchCallback: (eventType: string) => void = () => { };
            mockedWatch.mockImplementation((_path, cb) => {
                watchCallback = cb as any;
                return makeFakeFsWatcher() as any;
            });
            const deviceManager = makeFakeDeviceManager();

            const watcher = new ConfigWatcher(deviceManager, 300);
            watcher.start();

            watchCallback('change');
            vi.advanceTimersByTime(100);
            watchCallback('change');
            vi.advanceTimersByTime(100);
            watchCallback('change');
            vi.advanceTimersByTime(300);

            expect(deviceManager.reload).toHaveBeenCalledTimes(1);
        });

        it('ignores non-"change" event types (e.g. "rename")', () => {
            mockedGetDevicesFilePath.mockReturnValue('/app/src/devices/devices.json');
            let watchCallback: (eventType: string) => void = () => { };
            mockedWatch.mockImplementation((_path, cb) => {
                watchCallback = cb as any;
                return makeFakeFsWatcher() as any;
            });
            const deviceManager = makeFakeDeviceManager();

            const watcher = new ConfigWatcher(deviceManager, 300);
            watcher.start();

            watchCallback('rename');
            vi.advanceTimersByTime(300);

            expect(deviceManager.reload).not.toHaveBeenCalled();
        });
    });

    describe('stop', () => {
        it('closes the fs watcher', () => {
            mockedGetDevicesFilePath.mockReturnValue('/app/src/devices/devices.json');
            const fakeFsWatcher = makeFakeFsWatcher();
            mockedWatch.mockReturnValue(fakeFsWatcher as any);
            const deviceManager = makeFakeDeviceManager();

            const watcher = new ConfigWatcher(deviceManager);
            watcher.start();
            watcher.stop();

            expect(fakeFsWatcher.close).toHaveBeenCalledTimes(1);
        });

        it('cancels a pending debounced reload', () => {
            mockedGetDevicesFilePath.mockReturnValue('/app/src/devices/devices.json');
            let watchCallback: (eventType: string) => void = () => { };
            mockedWatch.mockImplementation((_path, cb) => {
                watchCallback = cb as any;
                return makeFakeFsWatcher() as any;
            });
            const deviceManager = makeFakeDeviceManager();

            const watcher = new ConfigWatcher(deviceManager, 300);
            watcher.start();

            watchCallback('change');
            watcher.stop();
            vi.advanceTimersByTime(300);

            expect(deviceManager.reload).not.toHaveBeenCalled();
        });

        it('does nothing when called before start()', () => {
            const deviceManager = makeFakeDeviceManager();
            const watcher = new ConfigWatcher(deviceManager);

            expect(() => watcher.stop()).not.toThrow();
        });
    });
});