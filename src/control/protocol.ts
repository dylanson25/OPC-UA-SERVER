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
