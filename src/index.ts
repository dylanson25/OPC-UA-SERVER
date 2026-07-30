import { OPCUAServer } from 'node-opcua';
import { serverOptions } from './config/server-config.js';
import { loadDevices } from './devices/index.js';
import type { SessionLike } from './types/index.js';

const server = new OPCUAServer(serverOptions);

function buildAddressSpace(): void {
  const addressSpace = server.engine.addressSpace;
  const namespace = addressSpace.getOwnNamespace();

  loadDevices(addressSpace, namespace);
}

function describeSessionClient(session: SessionLike): string {
  const channel =
    session.channel || session._secureChannel || session.session?.channel;

  const name = session.sessionName ?? session.sessionId?.toString();

  return channel
    ? `${name} client:${channel.remoteAddress}:${channel.remotePort}`
    : name ?? 'unknown';
}

function registerSessionLogging(): void {
  server.on('create_session', (session: SessionLike) => {
    console.log('create_session:', describeSessionClient(session));
  });

  server.on('session_closed', (session: SessionLike) => {
    console.log('session_closed:', describeSessionClient(session));
  });
}

function startServer(): void {
  server.start(() => {
    const endpointUrl =
      server.endpoints[0].endpointDescriptions()[0].endpointUrl;

    console.log('Server listening (Ctrl+C to stop)');
    console.log('port:', server.endpoints[0].port);
    console.log('endpoint:', endpointUrl);
  });
}

server.initialize(() => {
  buildAddressSpace();
  registerSessionLogging();
  startServer();
});