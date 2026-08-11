/**
 * Wire types for the CLI <-> running-server control channel (see #37's ADR:
 * docs/decisions/0001-cli-server-control-channel.md). One JSON object per line
 * (NDJSON) over a local Unix domain socket / Windows named pipe — no length-prefix
 * framing needed. Shared by ControlServer, ControlClient, and future CLI commands
 * (#38-40) so every consumer speaks the exact same shape.
 */

export interface ControlErrorPayload {
    code: string;
    message: string;
    exitCode: number;
}

export type ClientMessage =
    | { kind: 'request'; id: string; type: string; payload?: unknown }
    | { kind: 'subscribe'; channel: string }
    | { kind: 'unsubscribe'; channel: string };

export type ServerMessage =
    | { kind: 'response'; id: string; ok: true; data: unknown }
    | { kind: 'response'; id: string; ok: false; error: ControlErrorPayload }
    | { kind: 'event'; channel: string; data: unknown };

/**
 * What a ControlClient throws/rejects with when a request fails on the server side.
 * Not an AppError subclass: AppError's category classes each fix their own exitCode
 * (see src/errors/), so reconstructing e.g. `new ServerError(...)` client-side would
 * silently force exitCode back to 6 regardless of what the server actually sent —
 * this preserves the server's own `code`/`exitCode` exactly as decided there.
 */
export class RemoteControlError extends Error {
    constructor(
        readonly code: string,
        message: string,
        readonly exitCode: number,
    ) {
        super(message);
        this.name = 'RemoteControlError';
    }
}
