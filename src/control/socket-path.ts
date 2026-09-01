import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * Resolves the local IPC address (Unix domain socket path, or Windows named pipe
 * name) for the control channel of a server running on `port`. Keyed by port so
 * multiple local instances (e.g. dev + a second instance on a different --port)
 * don't collide, and so a future CLI command can derive the same address purely
 * from the port it's targeting, without needing to ask the server first.
 */
export function getControlSocketPath(port: number): string {
    if (process.platform === 'win32') {
        // Named pipes live in their own OS-managed namespace, not the filesystem —
        // no directory to create, and they're inherently local-machine-only.
        return `\\\\.\\pipe\\opcua-server-${port}`;
    }

    const dir = path.join(os.tmpdir(), 'opcua-server');
    fs.mkdirSync(dir, { recursive: true });
    return path.join(dir, `${port}.sock`);
}
