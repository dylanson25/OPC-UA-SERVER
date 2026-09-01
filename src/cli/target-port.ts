import { InvalidArgumentError } from 'commander';

const DEFAULT_PORT = 4840;

export function resolveTargetPort(cliValue?: number): number {
    if (cliValue !== undefined) return cliValue;
    if (process.env.PORT) return Number.parseInt(process.env.PORT, 10);
    return DEFAULT_PORT;
}

/** commander option-parser for a --port flag targeting a running server. */
export function parseTargetPort(value: string): number {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65535) {
        throw new InvalidArgumentError(`Invalid port "${value}". Must be an integer between 1 and 65535.`);
    }
    return parsed;
}
