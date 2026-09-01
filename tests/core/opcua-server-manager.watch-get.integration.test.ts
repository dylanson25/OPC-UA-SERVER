import net from 'node:net';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { ExitCode } from '../../src/errors/index.ts';
import { mockProcessExit, silenceCommanderOutput, ProcessExitSignal } from '../cli/process-exit-helper.ts';

/**
 * Real server, real control channel, real OPC UA client writes — no mocks. Mirrors
 * the setup in opcua-server-manager.control-channel.integration.test.ts, but
 * exercises #40's `tags.resolve`/`tags.get` handlers and the `tag-updates` event
 * channel against the actual devices.json-loaded address space.
 */

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

describe('OPCUAServerManager watch/get integration (#40)', () => {
    let OPCUAServerManager: typeof import('../../src/core/opcua-server-manager.ts').OPCUAServerManager;
    let ControlClient: typeof import('../../src/control/index.ts').ControlClient;
    let getControlSocketPath: typeof import('../../src/control/index.ts').getControlSocketPath;
    let createProgram: typeof import('../../src/cli/program.ts').createProgram;
    let OPCUAClient: typeof import('node-opcua').OPCUAClient;
    let AttributeIds: typeof import('node-opcua').AttributeIds;
    let DataType: typeof import('node-opcua').DataType;
    let manager: InstanceType<typeof OPCUAServerManager>;
    let port: number;
    let endpointUrl: string;

    beforeAll(async () => {
        port = await getFreePort();
        process.env.PORT = String(port);
        process.env.LOG_LEVEL = 'silent';
        process.env.NODE_ENV = 'production';

        ({ OPCUAServerManager } = await import('../../src/core/opcua-server-manager.ts'));
        ({ ControlClient, getControlSocketPath } = await import('../../src/control/index.ts'));
        ({ createProgram } = await import('../../src/cli/program.ts'));
        ({ OPCUAClient, AttributeIds, DataType } = await import('node-opcua'));

        endpointUrl = `opc.tcp://127.0.0.1:${port}/UA/`;

        manager = new OPCUAServerManager();
        manager.initialize();

        const socketPath = getControlSocketPath(port);
        const deadline = Date.now() + 10_000;
        let lastErr: unknown;
        while (Date.now() < deadline) {
            const probe = new ControlClient(socketPath);
            try {
                await probe.connect(300);
                probe.disconnect();
                lastErr = undefined;
                break;
            } catch (err) {
                lastErr = err;
                await new Promise((resolve) => setTimeout(resolve, 100));
            }
        }
        if (lastErr) throw lastErr;
    }, 30_000);

    afterAll(async () => {
        await new Promise<void>((resolve) => manager.shutdown(() => resolve()));
    }, 15_000);

    async function writeTag(nodeId: string, dataType: import('node-opcua').DataType, value: unknown) {
        const client = OPCUAClient.create({ endpointMustExist: false, applicationUri: 'urn:node-opcua:TestWriter' });
        await client.connect(endpointUrl);
        const session = await client.createSession();
        try {
            const statusCode = await session.write({
                nodeId,
                attributeId: AttributeIds.Value,
                value: { value: { dataType, value } },
            });
            expect(statusCode.value).toBe(0);
        } finally {
            await session.close();
            await client.disconnect();
        }
    }

    describe('tags.resolve', () => {
        it('resolves every tag on a device', async () => {
            const client = new ControlClient(getControlSocketPath(port));
            await client.connect();

            const resolved = await client.request<{ device: string; browseName: string }[]>('tags.resolve', {
                device: 'PLC1',
            });

            expect(resolved).toHaveLength(6);
            expect(resolved.every((t) => t.device === 'PLC1')).toBe(true);
            expect(resolved.map((t) => t.browseName)).toEqual(
                expect.arrayContaining(['Temperature', 'CycleCount', 'Pressure']),
            );

            client.disconnect();
        });

        it('resolves a single tag by nodeId', async () => {
            const client = new ControlClient(getControlSocketPath(port));
            await client.connect();

            const resolved = await client.request<{ browseName: string }[]>('tags.resolve', {
                nodeId: 'ns=1;s=PLC1.Temperature',
            });

            expect(resolved).toEqual([
                expect.objectContaining({ device: 'PLC1', browseName: 'Temperature', type: 'float' }),
            ]);

            client.disconnect();
        });

        it('resolves a single tag by browseName when it is unique across devices', async () => {
            const client = new ControlClient(getControlSocketPath(port));
            await client.connect();

            const resolved = await client.request<{ browseName: string }[]>('tags.resolve', {
                browseName: 'Pump Running',
            });

            expect(resolved).toEqual([expect.objectContaining({ device: 'PLC2', browseName: 'Pump Running' })]);

            client.disconnect();
        });

        it('rejects an unknown nodeId with a categorized TAG_NOT_FOUND error', async () => {
            const client = new ControlClient(getControlSocketPath(port));
            await client.connect();

            await expect(client.request('tags.resolve', { nodeId: 'ns=9;s=Nope' })).rejects.toMatchObject({
                code: 'TAG_NOT_FOUND',
            });

            client.disconnect();
        });

        it('rejects an unknown device with a categorized DEVICE_NOT_FOUND error', async () => {
            const client = new ControlClient(getControlSocketPath(port));
            await client.connect();

            await expect(client.request('tags.resolve', { device: 'NOPE' })).rejects.toMatchObject({
                code: 'DEVICE_NOT_FOUND',
            });

            client.disconnect();
        });
    });

    describe('tags.get', () => {
        it('reads the current value of every tag on a device', async () => {
            const client = new ControlClient(getControlSocketPath(port));
            await client.connect();

            const values = await client.request<{ browseName: string; value: unknown }[]>('tags.get', {
                device: 'PLC2',
            });

            expect(values).toEqual([expect.objectContaining({ browseName: 'Pump Running', value: true })]);

            client.disconnect();
        });

        it('reads only the requested --tags subset of a device', async () => {
            const client = new ControlClient(getControlSocketPath(port));
            await client.connect();

            const values = await client.request<{ browseName: string; value: unknown }[]>('tags.get', {
                device: 'PLC1',
                tags: ['CycleCount', 'Temperature'],
            });

            expect(values.map((v) => v.browseName)).toEqual(['CycleCount', 'Temperature']);
            expect(values.find((v) => v.browseName === 'CycleCount')?.value).toBe(42);
            expect(values.find((v) => v.browseName === 'Temperature')?.value).toBeCloseTo(25.5);

            client.disconnect();
        });

        it('reflects a value written by a real OPC UA client', async () => {
            await writeTag('ns=1;s=PLC1.Temperature', DataType.Float, 30);

            const client = new ControlClient(getControlSocketPath(port));
            await client.connect();

            const [value] = await client.request<{ value: unknown }[]>('tags.get', {
                nodeId: 'ns=1;s=PLC1.Temperature',
            });

            expect(value.value).toBeCloseTo(30);

            client.disconnect();
        });
    });

    describe('tag-updates event channel', () => {
        it('publishes a significant change with oldValue/newValue when a client writes a tag', async () => {
            const client = new ControlClient(getControlSocketPath(port));
            await client.connect();

            const events: any[] = [];
            client.subscribe('tag-updates', (data) => events.push(data));

            await writeTag('ns=1;s=PLC2.PumpRunning', DataType.Boolean, false);

            await vi.waitFor(
                () => {
                    expect(events.some((e) => e.nodeId === 'ns=1;s=PLC2.PumpRunning')).toBe(true);
                },
                { timeout: 5000 },
            );

            const event = events.find((e) => e.nodeId === 'ns=1;s=PLC2.PumpRunning');
            expect(event).toMatchObject({
                device: 'PLC2',
                browseName: 'Pump Running',
                newValue: false,
                significant: true,
            });
            expect(typeof event.timestamp).toBe('string');

            client.disconnect();
        });

        it('still publishes an insignificant change (below threshold), tagged significant: false', async () => {
            // PLC1.Pressure has threshold 120 — a 0.05 nudge is well inside the deadband.
            const client = new ControlClient(getControlSocketPath(port));
            await client.connect();

            const events: any[] = [];
            client.subscribe('tag-updates', (data) => events.push(data));

            await writeTag('ns=1;s=PLC1.Pressure', DataType.Double, 101.3);

            await vi.waitFor(
                () => {
                    expect(events.some((e) => e.nodeId === 'ns=1;s=PLC1.Pressure')).toBe(true);
                },
                { timeout: 5000 },
            );

            const event = events.find((e) => e.nodeId === 'ns=1;s=PLC1.Pressure');
            expect(event.significant).toBe(false);

            client.disconnect();
        });
    });

    describe('CLI end-to-end', () => {
        it('`get --device PLC2` prints the current value and exits SUCCESS', async () => {
            const exitSpy = mockProcessExit();
            const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
            try {
                const program = createProgram();
                silenceCommanderOutput(program);

                await expect(
                    program.parseAsync(['get', '--port', String(port), '--device', 'PLC2'], { from: 'user' }),
                ).rejects.toBeInstanceOf(ProcessExitSignal);

                expect(exitSpy).toHaveBeenNthCalledWith(1, ExitCode.SUCCESS);
                expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('PLC2.Pump Running'));
            } finally {
                exitSpy.mockRestore();
                logSpy.mockRestore();
            }
        });

        it('`watch --device PLC2` prints a real write and exits cleanly on SIGINT', async () => {
            const exitSpy = mockProcessExit();
            const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
            // Captures watch's `process.once('SIGINT', ...)` handler without actually
            // registering it — a plain `process.emit('SIGINT')` would also trigger any
            // *other* SIGINT listener already attached in this process (Vitest's own,
            // node-opcua's, etc.), which is exactly what made this flaky: an unrelated
            // listener called process.exit() first, with no args, before ours ever ran.
            let sigintHandler: (() => void) | undefined;
            const onceSpy = vi
                .spyOn(process, 'once')
                .mockImplementation(((event: string, handler: (...args: unknown[]) => void) => {
                    if (event === 'SIGINT') sigintHandler = handler as () => void;
                    return process;
                }) as typeof process.once);
            try {
                const program = createProgram();
                silenceCommanderOutput(program);

                const watchDone = program.parseAsync(['watch', '--port', String(port), '--device', 'PLC2'], {
                    from: 'user',
                });

                // The action resolves once resolve+subscribe are done (watch doesn't
                // exit on its own) — awaiting it here is safe and doesn't hang.
                await watchDone;

                await writeTag('ns=1;s=PLC2.PumpRunning', DataType.Boolean, true);

                await vi.waitFor(
                    () => {
                        expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('PLC2.Pump Running'));
                    },
                    { timeout: 5000 },
                );

                expect(sigintHandler).toBeInstanceOf(Function);
                expect(() => sigintHandler?.()).toThrow(ProcessExitSignal);
                expect(exitSpy).toHaveBeenCalledWith(ExitCode.SUCCESS);

                // The socket really closed server-side: a fresh client can still connect
                // and use the control channel normally afterwards (server unaffected).
                const probe = new ControlClient(getControlSocketPath(port));
                await expect(probe.connect()).resolves.toBeUndefined();
                probe.disconnect();
            } finally {
                onceSpy.mockRestore();
                exitSpy.mockRestore();
                logSpy.mockRestore();
            }
        });
    });
});
