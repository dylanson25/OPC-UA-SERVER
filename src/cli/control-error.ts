import { RemoteControlError } from '../control/index.ts';
import { AppError, ExitCode } from '../errors/index.ts';

export function reportControlChannelFailure(err: unknown, fallbackMessage: string): never {
    if (err instanceof AppError || err instanceof RemoteControlError) {
        console.error(`${err.code}\n\n${err.message}`);
        process.exit(err.exitCode);
    }

    console.error(`${fallbackMessage}: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(ExitCode.UNKNOWN_ERROR);
}
