import net from 'node:net';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { ExitCode } from '../../src/errors/index.ts';
import { mockProcessExit, silenceCommanderOutput, ProcessExitSignal } from '../cli/process-exit-helper.ts';

/**
 * Real server, real control channel, no mocks — mirrors the setup in
 * tests/core/opcua-server-manager.integration.test.ts, but exercises the #37
 * control channel specifically: it starts alongside the OPC UA server, is reachable
 * through a real ControlClient, and is torn down cleanly on shutdown.
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

describe('OPCUAServerManager control channel integration', () => {
    let OPCUAServerManager: typeof import('../../src/core/opcua-server-manager.ts').OPCUAServerManager;
    let ControlClient: typeof import('../../src/control/index.ts').ControlClient;
    let getControlSocketPath: typeof import('../../src/control/index.ts').getControlSocketPath;
    // Imported dynamically (like the two above), rather than statically at the top of
    // this file, for the same reason: src/cli/program.ts transitively pulls in
    // src/control/index.ts -> the shared pino logger singleton, which fixes its level
    // from process.env at first import. A static import here would create that
    // singleton before beforeAll sets LOG_LEVEL='silent' below.
    let createProgram: typeof import('../../src/cli/program.ts').createProgram;
    let manager: InstanceType<typeof OPCUAServerManager>;
    let port: number;
    let hasShutDown = false;

    beforeAll(async () => {
        port = await getFreePort();
        process.env.PORT = String(port);
        process.env.LOG_LEVEL = 'silent';
        process.env.NODE_ENV = 'production';

        ({ OPCUAServerManager } = await import('../../src/core/opcua-server-manager.ts'));
        ({ ControlClient, getControlSocketPath } = await import('../../src/control/index.ts'));
        ({ createProgram } = await import('../../src/cli/program.ts'));

        manager = new OPCUAServerManager();
        manager.initialize();

        // Poll for readiness via the control channel itself, rather than a fixed
        // sleep: the channel only starts once the server's own start() callback
        // fires, so a successful connect is a real readiness signal.
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
        if (hasShutDown) return;
        await new Promise<void>((resolve) => manager.shutdown(() => resolve()));
    }, 15_000);

    it('exposes a ControlServer reachable at the port-derived socket path', async () => {
        const client = new ControlClient(getControlSocketPath(port));
        await expect(client.connect()).resolves.toBeUndefined();
        client.disconnect();
    });

    it('responds to the built-in ping request', async () => {
        const client = new ControlClient(getControlSocketPath(port));
        await client.connect();

        const response = await client.request<{ pong: boolean; uptimeMs: number }>('ping');

        expect(response.pong).toBe(true);
        expect(typeof response.uptimeMs).toBe('number');
        client.disconnect();
    });

    it('is the same instance exposed by manager.getControlServer()', () => {
        expect(manager.getControlServer()).toBeDefined();
    });

    it('info reports the real device/tag/session counts from the running server', async () => {
        const client = new ControlClient(getControlSocketPath(port));
        await client.connect();

        const info = await client.request<{
            version: string;
            status: string;
            devices: number;
            tags: number;
            sessions: number;
        }>('info');

        expect(info.status).toBe('running');
        expect(info.devices).toBe(manager.getDeviceManager()?.list().length);
        expect(typeof info.tags).toBe('number');
        expect(info.tags).toBeGreaterThan(0);
        expect(info.sessions).toBe(0);

        client.disconnect();
    });

    it('reload triggers a real DeviceManager reload without corrupting tag counts', async () => {
        const client = new ControlClient(getControlSocketPath(port));
        await client.connect();

        const before = await client.request<{ tags: number; devices: number }>('info');

        const reloadResult = await client.request<{ reloaded: true; deviceCount: number }>('reload');
        expect(reloadResult.reloaded).toBe(true);
        expect(reloadResult.deviceCount).toBe(before.devices);

        const after = await client.request<{ tags: number; devices: number }>('info');

        // Regression coverage for a real bug found while implementing #38: tag counts
        // used to double on every reload because removed devices' tags were never
        // decremented from MetricsService.
        expect(after.tags).toBe(before.tags);
        expect(after.devices).toBe(before.devices);

        client.disconnect();
    });

    it('opcua-server healthcheck exits ExitCode.SUCCESS while the server is healthy', async () => {
        const exitSpy = mockProcessExit();
        try {
            const program = createProgram();
            silenceCommanderOutput(program);

            await expect(
                program.parseAsync(['healthcheck', '--port', String(port)], { from: 'user' }),
            ).rejects.toBeInstanceOf(ProcessExitSignal);

            expect(exitSpy).toHaveBeenNthCalledWith(1, ExitCode.SUCCESS);
        } finally {
            exitSpy.mockRestore();
        }
    });

    it('opcua-server healthcheck exits a categorized non-zero code once the server is reachable but degraded', async () => {
        // Forces a real 'degraded' status the same way MetricsService derives it on its
        // own (5+ errors within the window) — not mocked, so this exercises the exact
        // "unhealthy but reachable" state #34's degraded-status derivation and #39's
        // healthcheck both rely on, distinguishing it from "unreachable" below.
        for (let i = 0; i < 5; i++) {
            manager.getMetrics().recordError('DeviceError');
        }

        const exitSpy = mockProcessExit();
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        try {
            const program = createProgram();
            silenceCommanderOutput(program);

            await expect(
                program.parseAsync(['healthcheck', '--port', String(port)], { from: 'user' }),
            ).rejects.toBeInstanceOf(ProcessExitSignal);

            expect(exitSpy).toHaveBeenNthCalledWith(1, ExitCode.SERVER_ERROR);
            const output = errorSpy.mock.calls.map((call) => call[0]).join('\n');
            expect(output).toContain('SERVER_UNHEALTHY');
        } finally {
            exitSpy.mockRestore();
            errorSpy.mockRestore();
        }
    });

    it('is unreachable after shutdown', async () => {
        hasShutDown = true;
        await new Promise<void>((resolve) => manager.shutdown(() => resolve()));

        const client = new ControlClient(getControlSocketPath(port));
        const start = Date.now();

        await expect(client.connect(2000)).rejects.toMatchObject({ code: 'SERVER_NOT_RUNNING' });
        expect(Date.now() - start).toBeLessThan(1000);
    }, 15_000);

    it('opcua-server healthcheck exits a categorized non-zero code once the server is unreachable', async () => {
        const exitSpy = mockProcessExit();
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const start = Date.now();
        try {
            const program = createProgram();
            silenceCommanderOutput(program);

            await expect(
                program.parseAsync(['healthcheck', '--port', String(port)], { from: 'user' }),
            ).rejects.toBeInstanceOf(ProcessExitSignal);

            expect(exitSpy).toHaveBeenNthCalledWith(1, ExitCode.SERVER_ERROR);
            expect(Date.now() - start).toBeLessThan(3000);
            const output = errorSpy.mock.calls.map((call) => call[0]).join('\n');
            expect(output).toContain('SERVER_NOT_RUNNING');
        } finally {
            exitSpy.mockRestore();
            errorSpy.mockRestore();
        }
    });
});
