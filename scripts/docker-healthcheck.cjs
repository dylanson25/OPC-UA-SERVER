// Docker HEALTHCHECK for the OPC UA server. Plain CommonJS, no dependencies: the
// runtime image only has production node_modules, not build tooling, so this can't
// be TypeScript. Deliberately a transport-level check (does the configured port
// accept a TCP connection?), not a full OPC UA handshake — enough to catch "process
// alive but not actually listening" (crash-looped, still starting, port bind failed)
// without needing an OPC UA client stack in the health check itself.
'use strict';

const net = require('node:net');

const port = Number(process.env.PORT) || 4840;
// Always 127.0.0.1: this check runs *inside* the container, regardless of what
// HOSTNAME the server itself is configured to bind to (e.g. 0.0.0.0).
const host = '127.0.0.1';
const timeoutMs = 3000;

const socket = net.createConnection({ port, host });

socket.setTimeout(timeoutMs);

socket.once('connect', () => {
    socket.destroy();
    process.exit(0);
});

socket.once('timeout', () => {
    socket.destroy();
    process.exit(1);
});

socket.once('error', () => {
    process.exit(1);
});
