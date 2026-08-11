import net from 'node:net';
import fs from 'node:fs';

import { createModuleLogger } from '../infrastructure/logger/index.ts';
import { AppError, ErrorCode, ExitCode } from '../errors/index.ts';
import { readNdjson, writeNdjson } from './ndjson.ts';
import type { ClientMessage, ServerMessage } from './protocol.ts';

const logger = createModuleLogger('control');

type Handler = (payload: unknown) => unknown | Promise<unknown>;

/**
 * The server side of the CLI <-> running-server control channel (#37). Owns the
 * local socket/pipe, dispatches incoming requests to registered handlers, and fans
 * out published events to whichever connections have subscribed to a channel.
 * #38-40 register their own handlers/channels here rather than each opening a
 * separate listener.
 */
export class ControlServer {
    private server: net.Server | null = null;
    private readonly handlers = new Map<string, Handler>();
    private readonly subscriptions = new Map<string, Set<net.Socket>>();
    // All open connections, not just ones that have subscribed to a channel — needed
    // so stop() can actually close every client's socket, not only subscribers'.
    // net.Server.close() alone only stops accepting *new* connections; it never
    // closes ones already open, so without this a client with just a pending
    // request/response (no subscription) would never see the connection end.
    private readonly connections = new Set<net.Socket>();

    constructor(private readonly socketPath: string) {}

    registerHandler(type: string, handler: Handler): void {
        this.handlers.set(type, handler);
    }

    publish(channel: string, data: unknown): void {
        const sockets = this.subscriptions.get(channel);
        if (!sockets || sockets.size === 0) return;

        const message: ServerMessage = { kind: 'event', channel, data };
        for (const socket of sockets) {
            writeNdjson(socket, message);
        }
    }

    start(): void {
        if (this.server) return;

        this.removeStaleSocketFile();

        this.server = net.createServer((socket) => this.handleConnection(socket));

        this.server.on('error', (err) => {
            logger.error({ err, socketPath: this.socketPath }, 'Control channel server error');
        });

        this.server.listen(this.socketPath, () => {
            this.applyFilePermissions();
            logger.info({ socketPath: this.socketPath }, 'Control channel listening');
        });
    }

    stop(): Promise<void> {
        return new Promise((resolve) => {
            if (!this.server) {
                resolve();
                return;
            }

            for (const socket of this.connections) socket.destroy();
            this.connections.clear();
            this.subscriptions.clear();

            this.server.close(() => {
                this.server = null;
                this.removeStaleSocketFile();
                logger.info({ socketPath: this.socketPath }, 'Control channel stopped');
                resolve();
            });
        });
    }

    private handleConnection(socket: net.Socket): void {
        this.connections.add(socket);

        readNdjson(socket, (parsed) => {
            void this.handleMessage(socket, parsed as ClientMessage);
        });

        socket.on('close', () => {
            this.connections.delete(socket);
            for (const sockets of this.subscriptions.values()) {
                sockets.delete(socket);
            }
        });

        // Errors surface via the 'close' event above; nothing extra to do here, but an
        // unhandled 'error' event would otherwise crash the process.
        socket.on('error', () => {});
    }

    private async handleMessage(socket: net.Socket, message: ClientMessage): Promise<void> {
        if (message.kind === 'subscribe') {
            this.subscribe(socket, message.channel);
            return;
        }

        if (message.kind === 'unsubscribe') {
            this.subscriptions.get(message.channel)?.delete(socket);
            return;
        }

        if (message.kind === 'request') {
            await this.handleRequest(socket, message);
        }
    }

    private subscribe(socket: net.Socket, channel: string): void {
        let sockets = this.subscriptions.get(channel);
        if (!sockets) {
            sockets = new Set();
            this.subscriptions.set(channel, sockets);
        }
        sockets.add(socket);
    }

    private async handleRequest(
        socket: net.Socket,
        message: Extract<ClientMessage, { kind: 'request' }>,
    ): Promise<void> {
        const handler = this.handlers.get(message.type);

        if (!handler) {
            writeNdjson(socket, {
                kind: 'response',
                id: message.id,
                ok: false,
                error: {
                    code: ErrorCode.UNKNOWN_ERROR,
                    message: `No handler registered for request type "${message.type}"`,
                    exitCode: ExitCode.VALIDATION_ERROR,
                },
            } satisfies ServerMessage);
            return;
        }

        try {
            const data = await handler(message.payload);
            writeNdjson(socket, { kind: 'response', id: message.id, ok: true, data } satisfies ServerMessage);
        } catch (err) {
            const appError = err instanceof AppError ? err : null;
            writeNdjson(socket, {
                kind: 'response',
                id: message.id,
                ok: false,
                error: {
                    code: appError?.code ?? ErrorCode.UNKNOWN_ERROR,
                    message: err instanceof Error ? err.message : String(err),
                    exitCode: appError?.exitCode ?? ExitCode.UNKNOWN_ERROR,
                },
            } satisfies ServerMessage);
        }
    }

    private removeStaleSocketFile(): void {
        if (process.platform === 'win32') return; // named pipes aren't real filesystem entries
        try {
            fs.unlinkSync(this.socketPath);
        } catch {
            // Fine if it didn't already exist.
        }
    }

    private applyFilePermissions(): void {
        if (process.platform === 'win32') return;
        try {
            // Owner-only read/write — the file-permission baseline #37 asks for.
            fs.chmodSync(this.socketPath, 0o600);
        } catch (err) {
            logger.warn({ err, socketPath: this.socketPath }, 'Failed to set control socket file permissions');
        }
    }
}
