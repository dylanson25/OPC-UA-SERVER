import net from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';


function getFreePort(): Promise<number> {
    return new Promise((resolve, reject) => {
        const probe = net.createServer();
        probe.unref();
        probe.on('error', reject);
        probe.listen(0, '127.0.0.1', () => {
            const address = probe.address();
            const port = typeof address === 'object' && address ? address.port : 0;
            probe.close(() => resolve(port));
        });
    });
}

function waitForPort(host: string, port: number, attempts = 50, delayMs = 100): Promise<void> {
    return new Promise((resolve, reject) => {
        let remaining = attempts;

        const tryOnce = () => {
            const socket = new net.Socket();
            socket.once('connect', () => {
                socket.destroy();
                resolve();
            });
            socket.once('error', () => {
                socket.destroy();
                remaining -= 1;
                if (remaining <= 0) {
                    reject(new Error(`Timed out waiting for 127.0.0.1:${port} to accept connections`));
                } else {
                    setTimeout(tryOnce, delayMs);
                }
            });
            socket.connect(port, host);
        };

        tryOnce();
    });
}

describe('OPCUAServerManager integration', () => {
    let OPCUAServerManager: typeof import('../../src/core/opcua-server-manager.ts').OPCUAServerManager;
    let OPCUAClient: typeof import('node-opcua').OPCUAClient;
    let AttributeIds: typeof import('node-opcua').AttributeIds;
    let manager: InstanceType<typeof OPCUAServerManager>;
    let endpointUrl: string;
    let port: number;
    let hasShutDown = false;

    const createTestClient = (props: any = {}) => {
        return OPCUAClient.create({
            endpointMustExist: false,
            applicationUri: 'urn:node-opcua:MyClient',
            ...props
        });
    }

    beforeAll(async () => {
        port = await getFreePort();
        process.env.PORT = String(port);
        process.env.LOG_LEVEL = 'silent';
        process.env.NODE_ENV = 'production';

        ({ OPCUAServerManager } = await import('../../src/core/opcua-server-manager.ts'));
        ({ OPCUAClient, AttributeIds } = await import('node-opcua'));

        endpointUrl = `opc.tcp://127.0.0.1:${port}/UA/`;

        manager = new OPCUAServerManager();
        manager.initialize();

        await waitForPort('127.0.0.1', port);
    }, 30_000);

    afterAll(async () => {
        if (hasShutDown) return;

        await new Promise<void>((resolve) => manager.shutdown(() => resolve()));
    }, 15_000);

    it('initializes and builds the address space, exposing a DeviceManager', () => {
        expect(manager.getDeviceManager()).not.toBeNull();
    });

    it('loads devices from devices.json into the DeviceManager', () => {
        const devices = manager.getDeviceManager()?.list() ?? [];
        const keys = devices.map((d) => d.key);

        expect(keys).toEqual(expect.arrayContaining(['PLC1', 'PLC2']));
        expect(devices.find((d) => d.key === 'PLC1')?.config.name).toBe('PLC 1');
        expect(devices.find((d) => d.key === 'PLC2')?.config.name).toBe('PLC 2');
    });

    it('starts the server and accepts real client connections', async () => {
        const client = createTestClient();

        await client.connect(endpointUrl);
        await client.disconnect();
    });

    it('builds an address space exposing each device under ObjectsFolder', async () => {
        const client = createTestClient();

        await client.connect(endpointUrl);
        const session = await client.createSession();

        try {
            const result = await session.browse('ObjectsFolder');
            const browseNames = result.references?.map((r) => r.browseName.toString()) ?? [];

            expect(browseNames).toEqual(expect.arrayContaining(['1:PLC 1', '1:PLC 2']));
        } finally {
            await session.close();
            await client.disconnect();
        }
    });

    it('exposes device tag values that clients can read', async () => {
        const client = createTestClient();

        await client.connect(endpointUrl);
        const session = await client.createSession();

        try {
            const dataValue = await session.read({
                nodeId: 'ns=1;s=PLC1.Temperature',
                attributeId: AttributeIds.Value,
            });

            expect(dataValue.statusCode.value).toBe(0);
            expect(dataValue.value.value).toBeCloseTo(25.5);
        } finally {
            await session.close();
            await client.disconnect();
        }
    });

    it('is idempotent when initialize is called more than once', () => {
        expect(() => manager.initialize()).not.toThrow();
    });

    it('shuts down gracefully and releases the port', async () => {
        const shutdownPromise = new Promise<void>((resolve) => manager.shutdown(() => resolve()));
        hasShutDown = true;

        await shutdownPromise;

        const client = createTestClient({ connectionStrategy: { maxRetry: 0 } });


        await expect(client.connect(endpointUrl)).rejects.toThrow();
    }, 15_000);
});
