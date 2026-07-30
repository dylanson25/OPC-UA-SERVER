import { OPCUAServer } from 'node-opcua';
import { SetUpPlcDevice, SetUpPlcTPDevice } from './devices/index.js';
import { serverOptions } from './server-config.js';

const server = new OPCUAServer(serverOptions);

function buildAddressSpace() {
  const addressSpace = server.engine.addressSpace;
  const namespace = addressSpace.getOwnNamespace();

  SetUpPlcDevice(addressSpace, namespace);
  SetUpPlcTPDevice(addressSpace, namespace);
}

function describeSessionClient(session) {
  const channel =
    session.channel || session._secureChannel || session.session?.channel;
  const name = session.sessionName ?? session.sessionId?.toString();
  return channel
    ? `${name} client:${channel.remoteAddress}:${channel.remotePort}`
    : name;
}

function registerSessionLogging() {
  server.on('create_session', (session) => {
    console.log('create_session:', describeSessionClient(session));
  });

  server.on('session_closed', (session) => {
    console.log('session_closed:', describeSessionClient(session));
  });
}

function startServer() {
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
