import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockedStartServer = vi.hoisted(() => vi.fn());

vi.mock('../../../src/server-runner.ts', () => ({
    startServer: mockedStartServer,
}));

import { createProgram } from '../../../src/cli/program.ts';
import { silenceCommanderOutput } from '../process-exit-helper.ts';

const ENV_KEYS = ['HOSTNAME', 'PORT', 'LOG_LEVEL', 'DEVICES_CONFIG_PATH'] as const;

beforeEach(() => {
    mockedStartServer.mockClear();
    for (const key of ENV_KEYS) delete process.env[key];
});

afterEach(() => {
    for (const key of ENV_KEYS) delete process.env[key];
});

async function runStart(args: string[]): Promise<void> {
    const program = createProgram();
    silenceCommanderOutput(program);
    await program.parseAsync(['start', ...args], { from: 'user' });
}

describe('start command', () => {
    it('calls startServer() with no options passed', async () => {
        await runStart([]);

        expect(mockedStartServer).toHaveBeenCalledTimes(1);
        for (const key of ENV_KEYS) expect(process.env[key]).toBeUndefined();
    });

    it('sets HOSTNAME only when --hostname is passed', async () => {
        await runStart(['--hostname', '10.0.0.5']);

        expect(process.env.HOSTNAME).toBe('10.0.0.5');
        expect(process.env.PORT).toBeUndefined();
        expect(process.env.LOG_LEVEL).toBeUndefined();
        expect(process.env.DEVICES_CONFIG_PATH).toBeUndefined();
    });

    it('sets PORT (as a string) only when --port is passed', async () => {
        await runStart(['--port', '4880']);

        expect(process.env.PORT).toBe('4880');
        expect(process.env.HOSTNAME).toBeUndefined();
    });

    it('sets LOG_LEVEL only when --log-level is passed', async () => {
        await runStart(['--log-level', 'trace']);

        expect(process.env.LOG_LEVEL).toBe('trace');
    });

    it('sets DEVICES_CONFIG_PATH only when --config is passed', async () => {
        await runStart(['--config', './configs/plc-line-1.json']);

        expect(process.env.DEVICES_CONFIG_PATH).toBe('./configs/plc-line-1.json');
    });

    it('sets all four overrides together (the combined example from the issue)', async () => {
        await runStart([
            '--config',
            './configs/plc-line-1.json',
            '--hostname',
            '192.168.0.150',
            '--port',
            '4880',
            '--log-level',
            'debug',
        ]);

        expect(process.env.DEVICES_CONFIG_PATH).toBe('./configs/plc-line-1.json');
        expect(process.env.HOSTNAME).toBe('192.168.0.150');
        expect(process.env.PORT).toBe('4880');
        expect(process.env.LOG_LEVEL).toBe('debug');
    });

    it('overrides an already-set env var when the corresponding flag is passed', async () => {
        process.env.HOSTNAME = 'original-from-env';

        await runStart(['--hostname', 'overridden-from-cli']);

        expect(process.env.HOSTNAME).toBe('overridden-from-cli');
    });

    it('leaves an already-set env var alone when the corresponding flag is omitted', async () => {
        process.env.HOSTNAME = 'original-from-env';

        await runStart([]);

        expect(process.env.HOSTNAME).toBe('original-from-env');
    });
});
