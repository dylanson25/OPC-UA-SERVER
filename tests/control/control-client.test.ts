import { describe, it, expect, afterEach } from 'vitest';

import { ControlServer } from '../../src/control/control-server.ts';
import { ControlClient } from '../../src/control/control-client.ts';
import { getControlSocketPath } from '../../src/control/socket-path.ts';
import { ExitCode } from '../../src/errors/index.ts';

let nextTestPort = 63000;
function uniqueSocketPath(): string {
    return getControlSocketPath(nextTestPort++);
}

const servers: ControlServer[] = [];
const clients: ControlClient[] = [];

afterEach(async () => {
    for (const client of clients.splice(0)) client.disconnect();
    for (const server of servers.splice(0)) await server.stop();
});

async function startServer(): Promise<{ server: ControlServer; socketPath: string }> {
    const socketPath = uniqueSocketPath();
    const server = new ControlServer(socketPath);
    server.start();
    servers.push(server);
    await new Promise((resolve) => setTimeout(resolve, 50));
    return { server, socketPath };
}

describe('ControlClient', () => {
    it('connects successfully to a running server', async () => {
        const { socketPath } = await startServer();
        const client = new ControlClient(socketPath);
        clients.push(client);

        await expect(client.connect()).resolves.toBeUndefined();
    });

    it('rejects quickly with ServerError(SERVER_NOT_RUNNING) when nothing is listening', async () => {
        const client = new ControlClient(uniqueSocketPath());
        clients.push(client);

        const start = Date.now();
        await expect(client.connect(2000)).rejects.toMatchObject({
            code: 'SERVER_NOT_RUNNING',
            exitCode: ExitCode.SERVER_ERROR,
        });

        // The whole point of a local socket over an OPC UA connection: this must not
        // hang anywhere close to the timeout — it should fail almost immediately.
        expect(Date.now() - start).toBeLessThan(1000);
    });

    it('request() throws SERVER_NOT_RUNNING if called before connect()', async () => {
        const client = new ControlClient(uniqueSocketPath());
        clients.push(client);

        await expect(client.request('ping')).rejects.toMatchObject({ code: 'SERVER_NOT_RUNNING' });
    });

    it('subscribe() throws SERVER_NOT_RUNNING if called before connect()', async () => {
        const client = new ControlClient(uniqueSocketPath());
        clients.push(client);

        expect(() => client.subscribe('x', () => {})).toThrow(
            expect.objectContaining({ code: 'SERVER_NOT_RUNNING' }),
        );
    });

    it('a request that times out rejects with a timeout error, not a hang', async () => {
        const { server, socketPath } = await startServer();
        server.registerHandler('never-responds', () => new Promise(() => {}));
        const client = new ControlClient(socketPath);
        clients.push(client);
        await client.connect();

        await expect(client.request('never-responds', undefined, 100)).rejects.toThrow(/timed out/);
    });

    it('unsubscribe (the function returned by subscribe) stops further events from reaching the handler', async () => {
        const { server, socketPath } = await startServer();
        const client = new ControlClient(socketPath);
        clients.push(client);
        await client.connect();

        const received: unknown[] = [];
        const unsubscribe = client.subscribe('ticks', (data) => received.push(data));
        await new Promise((resolve) => setTimeout(resolve, 30));

        server.publish('ticks', 1);
        await new Promise((resolve) => setTimeout(resolve, 30));

        unsubscribe();
        server.publish('ticks', 2);
        await new Promise((resolve) => setTimeout(resolve, 30));

        expect(received).toEqual([1]);
    });

    it('multiple handlers can subscribe to the same channel independently', async () => {
        const { server, socketPath } = await startServer();
        const client = new ControlClient(socketPath);
        clients.push(client);
        await client.connect();

        const a: unknown[] = [];
        const b: unknown[] = [];
        client.subscribe('shared', (data) => a.push(data));
        client.subscribe('shared', (data) => b.push(data));
        await new Promise((resolve) => setTimeout(resolve, 30));

        server.publish('shared', 'x');
        await new Promise((resolve) => setTimeout(resolve, 30));

        expect(a).toEqual(['x']);
        expect(b).toEqual(['x']);
    });

    it('disconnect() closes the connection cleanly', async () => {
        const { socketPath } = await startServer();
        const client = new ControlClient(socketPath);
        clients.push(client);
        await client.connect();

        expect(() => client.disconnect()).not.toThrow();
    });

    it('pending requests reject if the connection closes before a response arrives', async () => {
        const { server, socketPath } = await startServer();
        server.registerHandler('never-responds', () => new Promise(() => {}));
        const client = new ControlClient(socketPath);
        clients.push(client);
        await client.connect();

        const pending = client.request('never-responds', undefined, 10_000);
        await new Promise((resolve) => setTimeout(resolve, 30));

        // stop() is idempotent (see ControlServer.stop()), so this and afterEach's own
        // cleanup call don't conflict.
        await server.stop();

        await expect(pending).rejects.toMatchObject({ code: 'SERVER_NOT_RUNNING' });
    });
});
