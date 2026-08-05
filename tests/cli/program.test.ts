import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { createProgram } from '../../src/cli/program.ts';
import { ExitCode } from '../../src/errors/index.ts';
import { mockProcessExit, silenceCommanderOutput, ProcessExitSignal } from './process-exit-helper.ts';

describe('createProgram', () => {
    let exitSpy: ReturnType<typeof mockProcessExit>;

    beforeEach(() => {
        exitSpy = mockProcessExit();
    });

    afterEach(() => {
        exitSpy.mockRestore();
    });

    it('registers the expected name and commands', () => {
        const program = createProgram();

        expect(program.name()).toBe('opcua-server');
        expect(program.commands.map((c) => c.name())).toEqual(expect.arrayContaining(['start', 'validate']));
    });

    it('--version exits with ExitCode.SUCCESS', async () => {
        const program = createProgram();
        silenceCommanderOutput(program);

        await expect(program.parseAsync(['--version'], { from: 'user' })).rejects.toBeInstanceOf(
            ProcessExitSignal,
        );

        expect(exitSpy).toHaveBeenNthCalledWith(1, ExitCode.SUCCESS);
    });

    it('--help exits with ExitCode.SUCCESS', async () => {
        const program = createProgram();
        silenceCommanderOutput(program);

        await expect(program.parseAsync(['--help'], { from: 'user' })).rejects.toBeInstanceOf(ProcessExitSignal);

        expect(exitSpy).toHaveBeenNthCalledWith(1, ExitCode.SUCCESS);
    });

    it('an unknown command exits with ExitCode.VALIDATION_ERROR', async () => {
        const program = createProgram();
        silenceCommanderOutput(program);

        await expect(program.parseAsync(['frobnicate'], { from: 'user' })).rejects.toBeInstanceOf(
            ProcessExitSignal,
        );

        expect(exitSpy).toHaveBeenNthCalledWith(1, ExitCode.VALIDATION_ERROR);
    });

    it('an unknown option exits with ExitCode.VALIDATION_ERROR', async () => {
        const program = createProgram();
        silenceCommanderOutput(program);

        await expect(
            program.parseAsync(['start', '--not-a-real-option'], { from: 'user' }),
        ).rejects.toBeInstanceOf(ProcessExitSignal);

        expect(exitSpy).toHaveBeenNthCalledWith(1, ExitCode.VALIDATION_ERROR);
    });
});
