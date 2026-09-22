import fs from 'node:fs';

import { OPCUAServer } from 'node-opcua';
import { nodesets } from 'node-opcua-nodesets';

import { serverOptions } from '../config/server-config.ts';
import { DeviceManager, ConfigWatcher } from '../devices/index.ts';
import { createModuleLogger } from '../infrastructure/logger/index.ts';
import { ConfigurationError, ErrorCode, RuntimeError, ServerError, logAppError } from '../errors/index.ts';
import { MetricsService } from '../metrics/index.ts';
import { ControlServer, getControlSocketPath } from '../control/index.ts';
import type {
    ReloadResult,
    InfoResult,
    ResolvedTag,
    TagSelector,
    TagValue,
    ExportNodesetResult,
} from '../control/index.ts';
import { TagRuntime } from '../tags/tag-runtime.ts';
import { resolveTagSelector } from '../devices/resolve-tags.ts';
import { readCertificateSummary } from '../utils/index.ts';
import type { SessionLike } from '../types/index.ts';
import type { INamespace } from 'node-opcua-address-space-base';

const CONTROL_HEARTBEAT_INTERVAL_MS = 5000;

export class OPCUAServerManager {
    private readonly logger = createModuleLogger('server');
    private readonly server: OPCUAServer;
    private readonly metrics = new MetricsService();
    private readonly tagRuntime = new TagRuntime();
    private readonly controlServer = new ControlServer(getControlSocketPath(serverOptions.port));
    private readonly metricsLogIntervalMs = Number(process.env.METRICS_LOG_INTERVAL_MS) || 0;
    private metricsLogTimer: NodeJS.Timeout | null = null;
    private controlHeartbeatTimer: NodeJS.Timeout | null = null;
    private initialized = false;
    private isShuttingDown = false;
    private deviceManager: DeviceManager | null = null;
    private configWatcher: ConfigWatcher | null = null;
    private namespace: INamespace | null = null;

    constructor() {
        const { nodesetFiles, ...opcuaOptions } = serverOptions;

        this.server = new OPCUAServer({
            ...opcuaOptions,
            nodeset_filename: [nodesets.standard, ...this.resolveNodesetFiles(nodesetFiles)],
        });
    }

    /**
     * Validates each extra NodeSet2 XML file (NODESET_FILES / `start --nodeset-file`)
     * exists before handing the list to node-opcua — an unreadable path there fails
     * deep inside its own XML parser with a much less useful error. A missing file is
     * logged and skipped rather than aborting the whole server: consistent with how
     * config-reader.ts's findDevicesDirectory() degrades instead of crashing on a bad
     * path. `nodesets.standard` itself is prepended by the constructor, not here —
     * passing our own `nodeset_filename` array to OPCUAServer fully replaces
     * node-opcua's default (server_engine.ts only falls back to the standard nodeset
     * when the option is omitted entirely), so losing it would leave even the base UA
     * types unregistered.
     */
    private resolveNodesetFiles(files: string[]): string[] {
        return files.filter((file) => {
            if (fs.existsSync(file)) return true;

            logAppError(
                this.logger,
                new ConfigurationError(ErrorCode.NODESET_FILE_NOT_FOUND, 'NodeSet2 XML file not found, skipping', {
                    file,
                }),
            );
            this.metrics.recordError('ConfigurationError');
            return false;
        });
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
            this.logCertificateInfo();
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

    /** The live tag registry/change-stream behind `watch`/`get` (#40). Exposed for tests. */
    getTagRuntime(): TagRuntime {
        return this.tagRuntime;
    }

    /**
     * Registers every request handler the control channel (#37) currently serves —
     * the `ping`/`heartbeat` reference pair from #37 itself, `reload`/`info` (#38),
     * `tags.resolve`/`tags.get` plus the `tag-updates` event channel (#40), and
     * `export-nodeset`. Future commands register their own handlers here the same way
     * rather than opening a separate channel.
     */
    private startControlChannel(): void {
        this.controlServer.registerHandler('ping', () => ({
            pong: true,
            uptimeMs: this.metrics.getStatus().uptimeMs,
        }));

        this.controlServer.registerHandler('reload', () => this.handleReloadRequest());
        this.controlServer.registerHandler('info', () => this.handleInfoRequest());
        this.controlServer.registerHandler('tags.resolve', (payload) => this.handleTagsResolve(payload));
        this.controlServer.registerHandler('tags.get', (payload) => this.handleTagsGet(payload));
        this.controlServer.registerHandler('export-nodeset', () => this.handleExportNodeset());

        // Every tag write (significant or not) republished for `watch` (#40) to filter
        // client-side by nodeId/significance — no-ops via ControlServer.publish() when
        // nobody's subscribed to 'tag-updates'.
        this.tagRuntime.onChange((change) => this.controlServer.publish('tag-updates', change));

        this.controlServer.start();

        this.controlHeartbeatTimer = setInterval(() => {
            this.controlServer.publish('heartbeat', { time: new Date().toISOString() });
        }, CONTROL_HEARTBEAT_INTERVAL_MS);
        this.controlHeartbeatTimer.unref();
    }

    /**
     * Logged first thing on every start — same certificate data `opcua-server cert`
     * shows, from the same shared reader (src/utils/certificate-info.ts), so a look at
     * the startup log alone tells you which certificate a client would need to trust
     * (see README's "Server certificate" section) without a separate command. Never
     * fails startup itself: an unreadable/missing certificate is logged and skipped
     * rather than thrown, since by this point node-opcua has already accepted it (or
     * generated a fresh one) to get this far.
     */
    private logCertificateInfo(): void {
        try {
            const summary = readCertificateSummary(serverOptions.certificateFile);
            if (!summary) {
                this.logger.warn({ certificateFile: serverOptions.certificateFile }, 'certificate_not_found');
                return;
            }

            this.logger.info(
                {
                    path: summary.path,
                    subject: summary.subject,
                    validFrom: summary.notBefore.toISOString(),
                    validTo: summary.notAfter.toISOString(),
                },
                'certificate',
            );
        } catch (err) {
            this.logger.warn({ err, certificateFile: serverOptions.certificateFile }, 'Failed to read certificate info');
        }
    }

    private handleReloadRequest(): ReloadResult {
        const deviceManager = this.deviceManager;
        if (!deviceManager) {
            // Unreachable in practice: the control channel only starts (see start(),
            // above) after buildAddressSpace() has already set this.deviceManager.
            // Guarded rather than asserted so a future refactor can't turn it into a
            // silent crash of the control channel's handler dispatch.
            throw new RuntimeError(ErrorCode.UNKNOWN_ERROR, 'Device manager not initialized');
        }

        const before = new Set(deviceManager.list().map((d) => d.key));
        const success = deviceManager.reload();

        if (!success) {
            throw new ConfigurationError(
                ErrorCode.DEVICE_CONFIG_INVALID,
                'Device configuration reload failed: the new configuration is invalid. Previous devices remain active.',
            );
        }

        const afterList = deviceManager.list();
        const after = new Set(afterList.map((d) => d.key));

        return {
            reloaded: true,
            deviceCount: afterList.length,
            devices: afterList.map((d) => ({ key: d.key, name: d.config.name })),
            added: [...after].filter((key) => !before.has(key)),
            removed: [...before].filter((key) => !after.has(key)),
        };
    }

    private handleTagsResolve(payload: unknown): ResolvedTag[] {
        const deviceManager = this.deviceManager;
        if (!deviceManager) {
            // Unreachable in practice — same reasoning as handleReloadRequest() above.
            throw new RuntimeError(ErrorCode.UNKNOWN_ERROR, 'Device manager not initialized');
        }

        return resolveTagSelector(deviceManager.list(), payload as TagSelector);
    }

    private handleTagsGet(payload: unknown): TagValue[] {
        return this.handleTagsResolve(payload).map((tag) => ({
            ...tag,
            value: this.tagRuntime.getValue(tag.nodeId),
        }));
    }

    /**
     * The server's own namespace (devices + tags) as standard NodeSet2 XML — the same
     * format tools like UaModeler/UaExpert import/export. `namespace.toNodeset2XML()`
     * is node-opcua's own address-space serializer; this just exposes it over the
     * control channel rather than re-implementing NodeSet2 output.
     */
    private handleExportNodeset(): ExportNodesetResult {
        if (!this.namespace) {
            // Unreachable in practice — same reasoning as handleReloadRequest() above.
            throw new RuntimeError(ErrorCode.UNKNOWN_ERROR, 'Address space not initialized');
        }

        return { xml: this.namespace.toNodeset2XML() };
    }

    private handleInfoRequest(): InfoResult {
        const status = this.metrics.getStatus();

        return {
            version: status.version,
            status: status.status,
            uptimeMs: status.uptimeMs,
            devices: this.metrics.getDevices().total,
            tags: this.metrics.getTags().total,
            sessions: this.metrics.getSessions().active,
        };
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
        this.namespace = namespace;

        this.deviceManager = new DeviceManager(addressSpace, namespace, this.metrics, this.tagRuntime);
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