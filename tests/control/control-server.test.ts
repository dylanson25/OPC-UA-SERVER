import { describe, it, expect, afterEach } from 'vitest';

import { ControlServer } from '../../src/control/control-server.ts';
import { ControlClient } from '../../src/control/control-client.ts';
import { getControlSocketPath } from '../../src/control/socket-path.ts';

/**
 * Real sockets/pipes, no mocks — same philosophy as
 * tests/core/opcua-server-manager.integration.test.ts. A ControlServer's behavior
 * is only meaningfully observable through a real client, so these tests exercise
 * both, with the assertions here focused on the server's own API surface
 * (registerHandler, publish, unknown request types, multiple connections).
 */

let nextTestPort = 62000;
function uniqueSocketPath(): string {
    return getControlSocketPath(nextTestPort++);
}

const servers: ControlServer[] = [];
const clients: ControlClient[] = [];

afterEach(async () => {
    for (const client of clients.splice(0)) client.disconnect();
    for (const server of servers.splice(0)) await server.stop();
});

async function startServerAndClient(): Promise<{ server: ControlServer; client: ControlClient }> {
    const socketPath = uniqueSocketPath();
    const server = new ControlServer(socketPath);
    server.start();
    servers.push(server);

    await new Promise((resolve) => setTimeout(resolve, 50));

    const client = new ControlClient(socketPath);
    await client.connect();
    clients.push(client);

    return { server, client };
}

describe('ControlServer', () => {
    it('dispatches a request to its registered handler and returns the result', async () => {
        const { server, client } = await startServerAndClient();
        server.registerHandler('echo', (payload) => ({ echoed: payload }));

        const response = await client.request('echo', { hello: 'world' });

        expect(response).toEqual({ echoed: { hello: 'world' } });
    });

    it('supports multiple independently registered handlers', async () => {
        const { server, client } = await startServerAndClient();
        server.registerHandler('a', () => 'A');
        server.registerHandler('b', () => 'B');

        expect(await client.request('a')).toBe('A');
        expect(await client.request('b')).toBe('B');
    });

    it('returns a structured error for an unregistered request type', async () => {
        const { client } = await startServerAndClient();

        await expect(client.request('does-not-exist')).rejects.toMatchObject({
            code: 'UNKNOWN_ERROR',
        });
    });

    it('propagates a handler exception as a structured error response', async () => {
        const { server, client } = await startServerAndClient();
        server.registerHandler('boom', () => {
            throw new Error('handler failed');
        });

        await expect(client.request('boom')).rejects.toMatchObject({
            message: 'handler failed',
        });
    });

    it('awaits an async handler before responding', async () => {
        const { server, client } = await startServerAndClient();
        server.registerHandler('slow', async () => {
            await new Promise((resolve) => setTimeout(resolve, 30));
            return 'done';
        });

        expect(await client.request('slow')).toBe('done');
    });

    it('publish() delivers an event to every subscriber of that channel', async () => {
        const { server, client } = await startServerAndClient();

        const received: unknown[] = [];
        client.subscribe('updates', (data) => received.push(data));
        await new Promise((resolve) => setTimeout(resolve, 30));

        server.publish('updates', { n: 1 });
        await new Promise((resolve) => setTimeout(resolve, 30));

        expect(received).toEqual([{ n: 1 }]);
    });

    it('publish() on a channel with no subscribers does not throw', async () => {
        const { server } = await startServerAndClient();

        expect(() => server.publish('nobody-listening', { n: 1 })).not.toThrow();
    });

    it('a second start() call is a harmless no-op', async () => {
        const { server } = await startServerAndClient();

        expect(() => server.start()).not.toThrow();
    });

    it('stop() on a server that was never started resolves without throwing', async () => {
        const server = new ControlServer(uniqueSocketPath());

        await expect(server.stop()).resolves.toBeUndefined();
    });
});
