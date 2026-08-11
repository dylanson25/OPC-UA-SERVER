import { OPCUAServer } from 'node-opcua';

import { serverOptions } from '../config/server-config.ts';
import { DeviceManager, ConfigWatcher } from '../devices/index.ts';
import { createModuleLogger } from '../infrastructure/logger/index.ts';
import { ErrorCode, ServerError, logAppError } from '../errors/index.ts';
import { MetricsService } from '../metrics/index.ts';
import { ControlServer, getControlSocketPath } from '../control/index.ts';
import type { SessionLike } from '../types/index.ts';

const CONTROL_HEARTBEAT_INTERVAL_MS = 5000;

export class OPCUAServerManager {
    private readonly logger = createModuleLogger('server');
    private readonly server: OPCUAServer;
    private readonly metrics = new MetricsService();
    private readonly controlServer = new ControlServer(getControlSocketPath(serverOptions.port));
    private readonly metricsLogIntervalMs = Number(process.env.METRICS_LOG_INTERVAL_MS) || 0;
    private metricsLogTimer: NodeJS.Timeout | null = null;
    private controlHeartbeatTimer: NodeJS.Timeout | null = null;
    private initialized = false;
    private isShuttingDown = false;
    private deviceManager: DeviceManager | null = null;
    private configWatcher: ConfigWatcher | null = null;

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

            this.metrics.setStatus('running');
            this.startMetricsLogging();
            this.startControlChannel();
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
        this.metrics.setStatus('stopping');
        this.logger.info('Shutting down OPC UA server...');

        const forceExitTimeout = setTimeout(() => {
            this.logger.error('Shutdown timed out, forcing exit');
            callback?.();
        }, 10_000);

        this.cleanupResources();

        try {
            this.server.shutdown(0, () => {
                clearTimeout(forceExitTimeout);
                this.metrics.setStatus('stopped');
                this.logger.info('Server shutdown complete');
                callback?.();
            });
        } catch (err) {
            clearTimeout(forceExitTimeout);
            this.metrics.setStatus('stopped');
            logAppError(
                this.logger,
                new ServerError(ErrorCode.SERVER_SHUTDOWN_FAILED, 'Error during server shutdown', {
                    err,
                }),
            );
            this.metrics.recordError('ServerError');
            callback?.();
        }
    }

    getDeviceManager(): DeviceManager | null {
        return this.deviceManager;
    }

    getMetrics(): MetricsService {
        return this.metrics;
    }

    /** The CLI <-> running-server control channel (#37). Exposed mainly for tests. */
    getControlServer(): ControlServer {
        return this.controlServer;
    }

    /**
     * Registers the reference handlers/channels that back this issue's own
     * acceptance criteria (a working request/response call and a working
     * subscription) — not stand-ins for #38-40's actual `info`/`healthcheck`/`watch`
     * commands, which register their own handlers on this same channel.
     */
    private startControlChannel(): void {
        this.controlServer.registerHandler('ping', () => ({
            pong: true,
            uptimeMs: this.metrics.getStatus().uptimeMs,
        }));

        this.controlServer.start();

        this.controlHeartbeatTimer = setInterval(() => {
            this.controlServer.publish('heartbeat', { time: new Date().toISOString() });
        }, CONTROL_HEARTBEAT_INTERVAL_MS);
        this.controlHeartbeatTimer.unref();
    }

    private cleanupResources(): void {
        this.stopMetricsLogging();
        if (this.controlHeartbeatTimer) {
            clearInterval(this.controlHeartbeatTimer);
            this.controlHeartbeatTimer = null;
        }
        void this.controlServer.stop();
        this.configWatcher?.stop();
        this.logger.debug('Resource cleanup completed');
    }

    private startMetricsLogging(): void {
        if (this.metricsLogTimer || this.metricsLogIntervalMs <= 0) return;

        this.metricsLogTimer = setInterval(() => {
            this.metrics.logSummary();
        }, this.metricsLogIntervalMs);
        this.metricsLogTimer.unref();
    }

    private stopMetricsLogging(): void {
        if (!this.metricsLogTimer) return;

        clearInterval(this.metricsLogTimer);
        this.metricsLogTimer = null;
    }

    private buildAddressSpace(): void {
        const addressSpace = this.server.engine.addressSpace;
        const namespace = addressSpace.getOwnNamespace();

        this.deviceManager = new DeviceManager(addressSpace, namespace, this.metrics);
        this.deviceManager.load();

        this.configWatcher = new ConfigWatcher(this.deviceManager);
        this.configWatcher.start();
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
            this.metrics.recordSessionOpened(
                this.sessionId(session),
                session.clientDescription?.applicationName?.text ?? 'unknown',
            );
        });

        this.server.on('session_closed', (session: SessionLike) => {
            this.logger.info({ client: this.describeSessionClient(session) }, 'session_closed');
            this.metrics.recordSessionClosed(this.sessionId(session));
        });
    }

    private sessionId(session: SessionLike): string {
        return session.sessionId?.toString() ?? session.sessionName ?? 'unknown';
    }
}