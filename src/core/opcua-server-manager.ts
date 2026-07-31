import { OPCUAServer } from 'node-opcua';

import { serverOptions } from '../config/server-config.js';
import { loadDevices } from '../devices/index.js';
import { createModuleLogger } from '../infrastructure/logger/index.js';
import type { SessionLike } from '../types/index.js';

export class OPCUAServerManager {
    private readonly logger = createModuleLogger('server');
    private readonly server: OPCUAServer;
    private initialized = false;

    constructor() {
        this.server = new OPCUAServer(serverOptions);
    }

    initialize(): void {
        if (this.initialized) return;

        this.initialized = true;

        this.server.initialize(() => {
            this.buildAddressSpace();
            this.registerSessionLogging();
            this.start();
        });
    }

    start(): void {
        this.server.start(() => {
            const endpoint = this.server.endpoints[0];
            const endpointUrl = endpoint?.endpointDescriptions()[0]?.endpointUrl;

            this.logger.info('Server listening (Ctrl+C to stop)');
            this.logger.info(
                { port: endpoint?.port, endpoint: endpointUrl },
                'server_details',
            );
        });
    }

    shutdown(callback?: () => void): void {
        this.server.shutdown(() => {
            this.logger.info('Server shutdown complete');
            callback?.();
        });
    }

    private buildAddressSpace(): void {
        const addressSpace = this.server.engine.addressSpace;
        const namespace = addressSpace.getOwnNamespace();

        loadDevices(addressSpace, namespace);
    }

    private describeSessionClient(session: SessionLike): string {
        const channel =
            session.channel || session._secureChannel || session.session?.channel;

        const name = session.sessionName ?? session.sessionId?.toString();

        return channel
            ? `${name} client:${channel.remoteAddress}:${channel.remotePort}`
            : (name ?? 'unknown');
    }

    private registerSessionLogging(): void {
        this.server.on('create_session', (session: SessionLike) => {
            this.logger.info({ client: this.describeSessionClient(session) }, 'create_session');
        });

        this.server.on('session_closed', (session: SessionLike) => {
            this.logger.info({ client: this.describeSessionClient(session) }, 'session_closed');
        });
    }
}
