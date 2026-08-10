import type { Socket } from 'node:net';

/**
 * Buffers incoming data on a socket and invokes `onMessage` once per complete
 * newline-delimited JSON line. Shared by ControlServer and ControlClient so the
 * framing logic (and its edge cases — partial reads, multiple messages arriving in
 * one chunk) exists exactly once.
 */
export function readNdjson(socket: Socket, onMessage: (parsed: unknown) => void): void {
    let buffer = '';

    socket.on('data', (chunk: Buffer) => {
        buffer += chunk.toString('utf8');

        let newlineIndex: number;
        while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
            const line = buffer.slice(0, newlineIndex);
            buffer = buffer.slice(newlineIndex + 1);

            if (!line.trim()) continue;

            try {
                onMessage(JSON.parse(line));
            } catch {
                // Malformed line: ignore rather than tearing down the connection over
                // one bad message (mirrors this codebase's general "log and continue"
                // philosophy from #33 rather than crashing the channel).
            }
        }
    });
}

export function writeNdjson(socket: Socket, message: unknown): void {
    socket.write(`${JSON.stringify(message)}\n`);
}
