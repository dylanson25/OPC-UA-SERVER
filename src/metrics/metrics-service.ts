import fs from 'node:fs';
import path from 'node:path';

import { createModuleLogger } from '../infrastructure/logger/index.ts';
import type {
    DeviceMetrics,
    DeviceSnapshot,
    DeviceStatus,
    ErrorCategory,
    ErrorMetrics,
    ServerStatus,
    SessionMetrics,
    SessionSnapshot,
    StatusSnapshot,
    TagMetrics,
    TagType,
} from './types.ts';

const logger = createModuleLogger('metrics');

const DEFAULT_DEGRADED_ERROR_THRESHOLD = 5;
const DEFAULT_DEGRADED_WINDOW_MS = 5 * 60_000;

function readPackageVersion(): string {
    try {
        const raw = fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8');
        const pkg = JSON.parse(raw) as { version?: string };
        return pkg.version ?? 'unknown';
    } catch {
        return 'unknown';
    }
}

const emptyTagCounts = (): TagMetrics['byType'] => ({
    boolean: 0,
    integer: 0,
    float: 0,
    double: 0,
    string: 0,
    dateTime: 0,
});

const emptyErrorCounts = (): ErrorMetrics['byCategory'] => ({
    ConfigurationError: 0,
    ValidationError: 0,
    DeviceError: 0,
    TagError: 0,
    ServerError: 0,
    RuntimeError: 0,
});

export interface MetricsServiceOptions {
    degradedErrorThreshold?: number;
    degradedWindowMs?: number;
    now?: () => number;
}

export class MetricsService {
    private status: ServerStatus = 'starting';
    private readonly startTime: number;
    private readonly version: string;
    private readonly now: () => number;
    private readonly degradedErrorThreshold: number;
    private readonly degradedWindowMs: number;

    private readonly devices = new Map<string, DeviceSnapshot>();
    private readonly tagCountsByType = emptyTagCounts();
    private readonly sessions = new Map<string, SessionSnapshot>();
    private readonly errorCountsByCategory = emptyErrorCounts();
    private recentErrorTimestamps: number[] = [];

    constructor(options: MetricsServiceOptions = {}) {
        this.now = options.now ?? Date.now;
        this.startTime = this.now();
        this.degradedErrorThreshold = options.degradedErrorThreshold ?? DEFAULT_DEGRADED_ERROR_THRESHOLD;
        this.degradedWindowMs = options.degradedWindowMs ?? DEFAULT_DEGRADED_WINDOW_MS;
        this.version = readPackageVersion();
    }

    setStatus(status: ServerStatus): void {
        this.status = status;
    }

    recordDeviceConnected(id: string, name: string): void {
        this.setDeviceStatus(id, name, 'connected');
    }

    recordDeviceError(id: string, name: string): void {
        this.setDeviceStatus(id, name, 'error');
    }

    recordDeviceRemoved(id: string): void {
        this.devices.delete(id);
    }

    recordTagCreated(type: TagType): void {
        this.tagCountsByType[type] += 1;
    }

    recordSessionOpened(sessionId: string, clientName: string): void {
        this.sessions.set(sessionId, {
            clientName,
            connectedAt: new Date(this.now()).toISOString(),
        });
    }

    recordSessionClosed(sessionId: string): void {
        this.sessions.delete(sessionId);
    }

    recordError(category: ErrorCategory): void {
        this.errorCountsByCategory[category] += 1;
        this.recentErrorTimestamps.push(this.now());
    }

    getStatus(): StatusSnapshot {
        return {
            status: this.deriveStatus(),
            startTime: new Date(this.startTime).toISOString(),
            uptimeMs: this.now() - this.startTime,
            version: this.version,
        };
    }

    getDevices(): DeviceMetrics {
        const devices = Array.from(this.devices.values());
        return { total: devices.length, devices };
    }

    getTags(): TagMetrics {
        const total = Object.values(this.tagCountsByType).reduce((sum, count) => sum + count, 0);
        return { total, byType: { ...this.tagCountsByType } };
    }

    getSessions(): SessionMetrics {
        const sessions = Array.from(this.sessions.values());
        return { active: sessions.length, sessions };
    }

    getErrors(): ErrorMetrics {
        const total = Object.values(this.errorCountsByCategory).reduce((sum, count) => sum + count, 0);
        return { total, byCategory: { ...this.errorCountsByCategory } };
    }

    logSummary(): void {
        const status = this.getStatus();
        const devices = this.getDevices();
        const tags = this.getTags();
        const sessions = this.getSessions();
        const errors = this.getErrors();

        logger.info(
            {
                status: status.status,
                uptimeMs: status.uptimeMs,
                devices: devices.total,
                tags: tags.total,
                sessions: sessions.active,
                errors: errors.total,
            },
            'Server metrics summary',
        );
    }

    private setDeviceStatus(id: string, name: string, status: DeviceStatus): void {
        this.devices.set(id, { id, name, status });
    }

    private pruneOldErrors(): void {
        const cutoff = this.now() - this.degradedWindowMs;
        this.recentErrorTimestamps = this.recentErrorTimestamps.filter((timestamp) => timestamp > cutoff);
    }

    private hasRecentErrorBurst(): boolean {
        this.pruneOldErrors();
        return this.recentErrorTimestamps.length >= this.degradedErrorThreshold;
    }

    private hasDeviceInError(): boolean {
        for (const device of this.devices.values()) {
            if (device.status === 'error') return true;
        }
        return false;
    }

    private deriveStatus(): ServerStatus {
        if (this.status === 'running' && (this.hasDeviceInError() || this.hasRecentErrorBurst())) {
            return 'degraded';
        }
        return this.status;
    }
}
