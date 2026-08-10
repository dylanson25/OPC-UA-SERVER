import net from 'node:net';
import { randomUUID } from 'node:crypto';

import { ErrorCode, ServerError } from '../errors/index.ts';
import { readNdjson, writeNdjson } from './ndjson.ts';
import type { ClientMessage, ServerMessage } from './protocol.ts';

interface PendingRequest {
    resolve: (data: unknown) => void;
    reject: (err: Error) => void;
    timer: NodeJS.Timeout;
}

/**
 * The client side of the CLI <-> running-server control channel (#37). #38-40
 * import this instead of touching `net`/the wire protocol directly, so every CLI
 * command that talks to a live server behaves identically on failure.
 */
export class ControlClient {
    private socket: net.Socket | null = null;
    private readonly pending = new Map<string, PendingRequest>();
    private readonly eventHandlers = new Map<string, Set<(data: unknown) => void>>();

    constructor(private readonly socketPath: string) {}

    /**
     * Connects to a running server's control channel. Rejects quickly (default 2s,
     * though a missing socket/pipe fails almost immediately in practice) with a
     * `ServerError(SERVER_NOT_RUNNING)` — never hangs indefinitely — per #37's
     * "fail clearly and predictably when no server is running" goal.
     */
    connect(timeoutMs = 2000): Promise<void> {
        return new Promise((resolve, reject) => {
            const socket = net.createConnection(this.socketPath);
            let settled = false;

            const timer = setTimeout(() => {
                if (settled) return;
                settled = true;
                socket.destroy();
                reject(this.notRunningError());
            }, timeoutMs);

            socket.once('connect', () => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                this.socket = socket;
                this.attachListeners(socket);
                resolve();
            });

            socket.once('error', () => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                socket.destroy();
                reject(this.notRunningError());
            });
        });
    }

    async request<T = unknown>(type: string, payload?: unknown, timeoutMs = 5000): Promise<T> {
        if (!this.socket) throw this.notRunningError();
        const socket = this.socket;

        const id = randomUUID();

        return new Promise<T>((resolve, reject) => {
            const timer = setTimeout(() => {
                this.pending.delete(id);
                reject(new Error(`Request "${type}" timed out after ${timeoutMs}ms`));
            }, timeoutMs);

            this.pending.set(id, { resolve: resolve as (data: unknown) => void, reject, timer });

            writeNdjson(socket, { kind: 'request', id, type, payload } satisfies ClientMessage);
        });
    }

    /** Subscribes to a published channel; returns an unsubscribe function. */
    subscribe(channel: string, onEvent: (data: unknown) => void): () => void {
        if (!this.socket) throw this.notRunningError();

        let handlers = this.eventHandlers.get(channel);
        if (!handlers) {
            handlers = new Set();
            this.eventHandlers.set(channel, handlers);
            writeNdjson(this.socket, { kind: 'subscribe', channel } satisfies ClientMessage);
        }
        handlers.add(onEvent);

        return () => {
            handlers?.delete(onEvent);
            if (handlers && handlers.size === 0) {
                this.eventHandlers.delete(channel);
                if (this.socket) {
                    writeNdjson(this.socket, { kind: 'unsubscribe', channel } satisfies ClientMessage);
                }
            }
        };
    }

    disconnect(): void {
        this.socket?.end();
        this.socket = null;
    }

    private notRunningError(): ServerError {
        return new ServerError(
            ErrorCode.SERVER_NOT_RUNNING,
            'No running OPC UA server was found on this machine for the configured port',
            { socketPath: this.socketPath },
        );
    }

    private attachListeners(socket: net.Socket): void {
        readNdjson(socket, (parsed) => this.handleMessage(parsed as ServerMessage));

        socket.once('close', () => {
            const closedError = new ServerError(
                ErrorCode.SERVER_NOT_RUNNING,
                'Control channel connection closed before a response was received',
                { socketPath: this.socketPath },
            );
            for (const { reject, timer } of this.pending.values()) {
                clearTimeout(timer);
                reject(closedError);
            }
            this.pending.clear();
        });

        socket.on('error', () => {});
    }

    private handleMessage(message: ServerMessage): void {
        if (message.kind === 'response') {
            const pending = this.pending.get(message.id);
            if (!pending) return;

            this.pending.delete(message.id);
            clearTimeout(pending.timer);

            // Strict `=== false` (not `!message.ok`): narrowing this *nested*
            // discriminated union (already narrowed once by `message.kind`) only works
            // with an explicit equality check — a distinct TS quirk from the flat-union
            // one worked around in src/devices/config-reader.ts, confirmed in isolation.
            if (message.ok === false) {
                pending.reject(new ServerError(message.error.code as ErrorCode, message.error.message));
                return;
            }

            pending.resolve(message.data);
            return;
        }

        if (message.kind === 'event') {
            const handlers = this.eventHandlers.get(message.channel);
            if (!handlers) return;
            for (const handler of handlers) handler(message.data);
        }
    }
}
