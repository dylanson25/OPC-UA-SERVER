export interface LogContext {
    module: string;
    sessionId?: string;
    nodeId?: string;
    [key: string]: unknown;
}

export type LogModule =
    | 'server'
    | 'session'
    | 'subscription'
    | 'security'
    | 'address-space'
    | 'metrics';