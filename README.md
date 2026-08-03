# OPC UA Lab Server

A configurable OPC UA server (built with [node-opcua](https://www.npmjs.com/package/node-opcua) and TypeScript) that simulates PLC devices defined in a JSON configuration file. Devices, tags, and their data types are validated with [zod](https://www.npmjs.com/package/zod) and exposed as OPC UA nodes for testing/integration with any OPC UA client.

## Requirements

- [Node.js](https://nodejs.org/) v18 or newer
- npm (comes with Node.js)

## Setup

1. Clone/copy the project folder.
2. Install dependencies:

   ```bash
   npm install
   ```

3. Copy `.env.example` to `.env` and adjust as needed:

   ```bash
   cp .env.example .env
   ```

## Configuration (environment variables)

Server connection settings are read from environment variables (via `.env`, loaded with `dotenv`) in [`src/config/server-config.ts`](src/config/server-config.ts):

| Variable       | Default         | Description                                                                             |
| -------------- | ---------------- | ---------------------------------------------------------------------------------------- |
| `PORT`         | `4840`           | TCP port the OPC UA endpoint listens on.                                                 |
| `HOSTNAME`     | `127.0.0.1`      | Interface/hostname the server binds to. Use `0.0.0.0` to listen on all interfaces.        |
| `RESOURCEPATH` | `/UA/`           | Path portion of the endpoint URL.                                                        |
| `PRODUCTNAME`  | `OPCUA-Server`   | Reported as the server's product name in `buildInfo`.                                    |
| `NODE_ENV`     | `development`    | `development` enables pretty-printed logs; any other value uses plain JSON logs.          |
| `LOG_LEVEL`    | `debug` (dev) / `info` (prod) | Minimum [pino](https://getpino.io/) log level.                             |
| `METRICS_LOG_INTERVAL_MS` | `0` (disabled) | If set to a positive number, logs a periodic metrics summary at that interval (ms). |

The full endpoint URL a client should connect to is:

```
opc.tcp://<HOSTNAME>:<PORT><RESOURCEPATH>
```

e.g. `opc.tcp://127.0.0.1:4840/UA/`

## Running the server

```bash
npm run build
npm start
```

For development (auto-restart on change, no build step):

```bash
npm run dev
```

If it starts correctly you'll see something like:

```
Server listening (Ctrl+C to stop)
port: 4840
endpoint: opc.tcp://127.0.0.1:4840/UA/
```

Stop the server gracefully with `Ctrl+C` (`SIGINT`/`SIGTERM` trigger a clean shutdown).

## Device configuration

Devices are defined in [`src/devices/devices.json`](src/devices/devices.json) as a map of `deviceKey -> device`:

```json
{
  "PLC1": {
    "name": "PLC 1",
    "nodeId": "ns=1;s=PLC1",
    "tags": [
      {
        "type": "float",
        "browseName": "Temperature",
        "nodeId": "ns=1;s=PLC1.Temperature",
        "initialValue": 25.5,
        "threshold": 0.5
      }
    ]
  }
}
```

- Each device becomes an OPC UA object under `ObjectsFolder`; each tag becomes a variable node under that object.
- Supported tag `type`s: `boolean`, `integer`, `float`, `double`, `string`, `dateTime`.
- `threshold` (numeric types only) sets the minimum change required before a value-change is logged (default `0.01`).
- The file is validated against a zod schema on every load/reload (`src/schemas/`) — device keys, node IDs, tag node IDs, and browse names must be unique. Invalid JSON, or a file that fails validation, is rejected and logged, leaving previously-loaded devices untouched.

### Hot reload

While the server is running, `ConfigWatcher` watches `devices.json` for changes and reloads devices automatically (debounced), without restarting the server. If the new file is invalid, the reload is skipped and the previous devices stay active.

## Error handling & exit codes

Application errors are represented by an `AppError` hierarchy in [`src/errors/`](src/errors/), so every failure carries a machine-readable code, a category, and extra context — not just a free-text log line:

```ts
abstract class AppError extends Error {
  abstract readonly code: ErrorCode;     // e.g. 'DEVICE_CONFIG_INVALID'
  abstract readonly exitCode: ExitCode;  // e.g. ExitCode.VALIDATION_ERROR
  readonly context?: Record<string, unknown>;
}
```

Category classes (`ConfigurationError`, `ValidationError`, `DeviceError`, `TagError`, `ServerError`, `RuntimeError`) each extend `AppError` and fix their `exitCode`; `ValidationError.fromZodError(...)` turns a zod validation failure into a structured error with a `Path:` / `Reason:` message for the first issue and the full issue list in `context.issues`.

**Runtime philosophy:** a single bad device, tag, or `devices.json` edit is logged with full context and skipped — the server keeps running. Only a genuinely fatal failure (an error that escapes normal control flow, or a failed shutdown) terminates the process, and it does so with the exit code matching that error's category:

| Code | Error Type          | Description                               |
| ---- | -------------------- | ------------------------------------------ |
| 0    | Success              | Operation completed successfully           |
| 1    | UnknownError          | Unexpected error (not an `AppError`)      |
| 2    | ConfigurationError    | Invalid or missing configuration          |
| 3    | ValidationError       | Schema validation failed                  |
| 4    | DeviceError           | Device loading or management failure      |
| 5    | TagError              | Tag creation or configuration failure     |
| 6    | ServerError           | OPC UA server lifecycle failure           |
| 7    | RuntimeError          | Unexpected runtime failure                |

`src/index.ts` installs a single `uncaughtException`/`unhandledRejection` handler: if the escaped error is an `AppError`, the process exits with that error's `exitCode`; any other error is logged and exits with `ExitCode.UNKNOWN_ERROR` (1). A clean `Ctrl+C`/`SIGTERM` shutdown always exits `0`.

### Error log file

Every `error`-level (and above) log entry is additionally written as JSON to `logs/errors.log` (created automatically), independent of the console output — useful for production troubleshooting without needing to capture stdout. Routine `debug`-level logs (e.g. tag value changes) never go there. Log rotation/shipping is intentionally out of scope; see `logs/errors.log` growth if running long-term and add rotation externally if needed.

## Runtime metrics

`OPCUAServerManager.getMetrics()` exposes a `MetricsService` ([`src/metrics/`](src/metrics/)) with a pull-based snapshot API — plain data, never pre-formatted strings, so any consumer (CLI, future REST API, future GUI) can format it however it needs:

```ts
metrics.getStatus();    // { status, startTime, uptimeMs, version }
metrics.getDevices();   // { total, devices: [{ id, name, status }] }
metrics.getTags();      // { total, byType: { boolean, integer, float, double, string, dateTime } }
metrics.getSessions();  // { active, sessions: [{ clientName, connectedAt }] }
metrics.getErrors();    // { total, byCategory: { ConfigurationError, ValidationError, ... } }
```

All counters are updated incrementally as devices register/fail/get removed, tags get created, sessions open/close, and errors get logged — `get*()` calls never rescan the address space, so they're safe to poll frequently (e.g. from a health check).

`status` is `'starting' | 'running' | 'degraded' | 'stopping' | 'stopped'`. `degraded` is derived automatically (not set directly): the server reports `degraded` instead of `running` whenever at least one device is in `'error'` status, or when 5+ errors have been recorded within the last 5 minutes (both configurable via `MetricsService` constructor options). This is the signal a health check should treat as unhealthy alongside `stopping`/`stopped`/`starting`.

Real-time tag value change notifications are intentionally **not** part of this service — that's a push/event concern for a future `watch`-style feature, not a pull-based snapshot.

## Project structure

```
src/
├── index.ts                     # Entry point: creates the server, wires up graceful shutdown
├── config/
│   └── server-config.ts         # Reads env vars into OPCUAServer options
├── core/
│   └── opcua-server-manager.ts  # Lifecycle: initialize -> build address space -> start -> shutdown
├── devices/
│   ├── devices.json              # Device/tag definitions (see above)
│   ├── config-reader.ts          # Reads + validates devices.json
│   ├── config-watcher.ts         # Watches devices.json and triggers hot reload
│   ├── device-factory.ts         # Creates an OPC UA object node for a device
│   └── device-manager.ts         # Registers/removes/reloads devices in the address space
├── tags/
│   ├── factory.ts                # Dispatches tag creation by type
│   └── primitive.ts               # Creates a variable node with change-logging
├── schemas/                      # zod schemas for devices/tags
├── errors/                       # AppError hierarchy, ErrorCode, ExitCode, logAppError
├── metrics/                      # MetricsService, ServerStatus/DeviceStatus types
├── types/                        # Shared TypeScript types
├── utils/
│   └── comparison.ts             # Numeric change-detection helper
└── infrastructure/
    └── logger/                   # pino logger setup (console + logs/errors.log)
```

## Testing

Tests run with [Vitest](https://vitest.dev/).

```bash
npm test              # run all tests once
npm run test:watch    # watch mode
npm run test:coverage # run with coverage report
```

- `tests/**/*.test.ts` — unit tests for schemas, tag factories, `DeviceManager`, `ConfigWatcher`, config reading, the `AppError`/`ExitCode` error system, and `MetricsService`, with `node-opcua` and the filesystem mocked.
- `tests/core/opcua-server-manager.integration.test.ts` — integration tests that boot a real OPC UA server on an OS-assigned port (no mocks), load the real `devices.json`, connect with a real OPC UA client, and verify address-space creation, device loading, tag reads, and graceful shutdown end-to-end.

## Linting & formatting

```bash
npm run lint         # ESLint
npm run lint:fix      # ESLint with autofix
npm run format:check  # Prettier check
npm run format        # Prettier write
```
