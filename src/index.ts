import { OPCUAServer } from 'node-opcua';
import { serverOptions } from './config/server-config.js';
import { loadDevices } from './devices/index.js';
import { createModuleLogger } from './infrastructure/logger/index.js';
import type { SessionLike } from './types/index.js';

const logger = createModuleLogger('server');
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
    : (name ?? 'unknown');
}

function registerSessionLogging(): void {
  server.on('create_session', (session: SessionLike) => {
    logger.info({ client: describeSessionClient(session) }, 'create_session');
  });

  server.on('session_closed', (session: SessionLike) => {
    logger.info({ client: describeSessionClient(session) }, 'session_closed');
  });
}

function startServer(): void {
  server.start(() => {
    const endpointUrl =
      server.endpoints[0].endpointDescriptions()[0].endpointUrl;

    logger.info('Server listening (Ctrl+C to stop)');
    logger.info({ port: server.endpoints[0].port, endpoint: endpointUrl }, 'server_details');
  });
}

server.initialize(() => {
  buildAddressSpace();
  registerSessionLogging();
  startServer();
});
