import { OPCUAServer } from 'node-opcua';

import { serverOptions } from '../config/server-config.ts';
import { loadDevices } from '../devices/index.ts';
import { createModuleLogger } from '../infrastructure/logger/index.ts';
import type { SessionLike } from '../types/index.ts';

export class OPCUAServerManager {
    private readonly logger = createModuleLogger('server');
    private readonly server: OPCUAServer;
    private initialized = false;
    private isShuttingDown = false;

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
        if (this.isShuttingDown) {
            this.logger.warn('Shutdown already in progress, ignoring duplicate call');
            return;
        }

        this.isShuttingDown = true;
        this.logger.info('Shutting down OPC UA server...');

        const forceExitTimeout = setTimeout(() => {
            this.logger.error('Shutdown timed out, forcing exit');
            callback?.();
        }, 10_000);

        this.cleanupResources();

        try {
            this.server.shutdown(0, () => {
                clearTimeout(forceExitTimeout);
                this.logger.info('Server shutdown complete');
                callback?.();
            });
        } catch (err) {
            clearTimeout(forceExitTimeout);
            this.logger.error({ err }, 'Error during server shutdown');
            callback?.();
        }
    }

    private cleanupResources(): void {

        this.logger.debug('Resource cleanup completed');
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
