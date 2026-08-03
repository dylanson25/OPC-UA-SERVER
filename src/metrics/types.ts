export type ServerStatus = 'starting' | 'running' | 'degraded' | 'stopping' | 'stopped';

export type DeviceStatus = 'connected' | 'disconnected' | 'error' | 'reloading';

export type TagType = 'boolean' | 'integer' | 'float' | 'double' | 'string' | 'dateTime';

export type ErrorCategory =
    | 'ConfigurationError'
    | 'ValidationError'
    | 'DeviceError'
    | 'TagError'
    | 'ServerError'
    | 'RuntimeError';

export interface StatusSnapshot {
    status: ServerStatus;
    startTime: string;
    uptimeMs: number;
    version: string;
}

export interface DeviceSnapshot {
    id: string;
    name: string;
    status: DeviceStatus;
}

export interface DeviceMetrics {
    total: number;
    devices: DeviceSnapshot[];
}

export interface TagMetrics {
    total: number;
    byType: Record<TagType, number>;
}

export interface SessionSnapshot {
    clientName: string;
    connectedAt: string;
}

export interface SessionMetrics {
    active: number;
    sessions: SessionSnapshot[];
}

export interface ErrorMetrics {
    total: number;
    byCategory: Record<ErrorCategory, number>;
}
