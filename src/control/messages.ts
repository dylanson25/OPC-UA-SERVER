import type { ServerStatus } from '../metrics/index.ts';

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
