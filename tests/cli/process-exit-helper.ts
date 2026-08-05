import { vi } from 'vitest';

/**
 * commander's `exitOverride` callback (see src/cli/program.ts) calls `process.exit()`
 * itself. In tests we don't want the test process to actually terminate, but we do
 * need control flow to stop at that point exactly like a real process.exit would —
 * a plain no-op mock would let commander's internal code keep running past it. This
 * mock throws instead, so `await program.parseAsync(...)` rejects with the exit code
 * we can assert on.
 */
export class ProcessExitSignal extends Error {
    constructor(public readonly code: number) {
        super(`process.exit(${code})`);
    }
}

export function mockProcessExit() {
    return vi.spyOn(process, 'exit').mockImplementation(((code?: string | number | null) => {
        throw new ProcessExitSignal(typeof code === 'number' ? code : 0);
    }) as never);
}

/** Silences commander's own stdout/stderr writes (help text, error messages) during tests. */
export function silenceCommanderOutput(program: { configureOutput: (config: object) => unknown }): void {
    program.configureOutput({
        writeOut: () => {},
        writeErr: () => {},
    });
}
