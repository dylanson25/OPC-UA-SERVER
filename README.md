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

## CLI

A [commander.js](https://github.com/tj/commander.js)-based `opcua-server` binary ([`src/cli/`](src/cli/), entry point [`src/cli/bin.ts`](src/cli/bin.ts)) is installed alongside the package (`"bin"` in `package.json`) and provides `start`/`validate`/`reload`/`info`/`healthcheck`/`watch`/`get`.

```bash
opcua-server --help
opcua-server --version
```

**`start`** — starts the server, same as `npm start`, with optional overrides:

```bash
opcua-server start
opcua-server start --config ./configs/plc-line-1.json --hostname 192.168.0.150 --port 4880 --log-level debug
```

| Flag | Overrides |
| --- | --- |
| `--config <path>` | Which devices.json-shaped file to load, instead of the normal search (`src/devices/` → `./devices/` → `dist/devices/`). |
| `--hostname <address>` | `HOSTNAME` |
| `--port <number>` | `PORT` |
| `--log-level <level>` | `LOG_LEVEL` — one of `fatal, error, warn, info, debug, trace, silent`. |

Overrides are applied **in memory only** for that run — nothing is written back to `.env` or any config file. Priority is CLI flag > environment variable > default; a flag left unset falls through to whatever `.env`/the environment already has.

`--log-level trace` makes every tag value update get logged (not just ones that pass the significant-change deadband) — useful for checking whether the deadband itself is filtering out an update you expected to see. At `debug` and above, only deadband-passing changes are logged (existing behavior).

**`validate`** — checks a device configuration file without starting the server:

```bash
opcua-server validate devices.json
```

```
✓ devices.json is valid — 2 device(s), 7 tag(s).
```

On failure, it prints the structured error code and message (from the `AppError` hierarchy — see below) and exits with the matching `ExitCode`:

```
$ opcua-server validate ./broken.json
DEVICE_CONFIG_INVALID

Path:
PLC1.tags.1.nodeId

Reason:
Duplicate nodeId: 'ns=1;s=Dup'.
```

### Talking to an already-running server

`start`/`validate` above are standalone — but `reload`, `info`, `healthcheck`, `watch`, and `get` reach into a server that's *already running*, from a separate CLI invocation. They all go through one dedicated local control channel ([`src/control/`](src/control/)) rather than each inventing their own. It runs alongside the OPC UA endpoint automatically — nothing to configure. Design decision and rationale: [`docs/decisions/0001-cli-server-control-channel.md`](docs/decisions/0001-cli-server-control-channel.md).

Every command below accepts `--port <number>` to target a server running on a non-default port (same resolution as `start`: flag > `PORT` env var > default `4840`).

**`reload`** — triggers a device configuration reload on the running server (equivalent to editing `devices.json`, which hot-reload already does automatically — useful when you want to trigger it explicitly, e.g. from a script):

```bash
opcua-server reload
```

```
✓ Configuration reloaded — 2 device(s) active.
  Added:   PLC3
  Removed: PLC-old
```

On failure (e.g. the current `devices.json` is invalid), it prints the server's structured error and exits with the matching `ExitCode` — `2` (`ConfigurationError`) in this example, not a generic failure code:

```
$ opcua-server reload
DEVICE_CONFIG_INVALID

Device configuration reload failed: the new configuration is invalid. Previous devices remain active.
```

**`info`** — displays current server status and statistics, backed by [`MetricsService`](src/metrics/metrics-service.ts) (#34):

```bash
opcua-server info
```

```
OPC UA Server v1.1.0
Status: running
Devices: 12
Tags: 450
Sessions: 3
Uptime: 4h 12m
```

Both exit with a categorized `ExitCode` (`SERVER_ERROR`, `6`) if no server is reachable on the target port — fast, not a hang:

```
$ opcua-server info
SERVER_NOT_RUNNING

No running OPC UA server was found on this machine for the configured port
```

**`healthcheck`** — a lightweight liveness check meant for orchestrators (Docker/Kubernetes) as well as manual debugging. Prints nothing by default; only the exit code matters:

```bash
opcua-server healthcheck
echo $?   # 0 = healthy
```

It reuses the exact same control-channel `info` request as the `info` command above — no separate health signal to keep in sync. `status: 'running'` is the only healthy state; `starting`, `degraded`, `stopping`, and `stopped` all count as unhealthy (same line the `MetricsService`-derived `degraded` status draws — see "Runtime metrics" below):

| Situation | Exit code | `ErrorCode` |
| --- | --- | --- |
| Reachable, `status: 'running'` | `0` | — |
| Reachable, any other `status` | `6` (`ServerError`) | `SERVER_UNHEALTHY` |
| Unreachable (no server on the target port) | `6` (`ServerError`) | `SERVER_NOT_RUNNING` |

```bash
opcua-server healthcheck --verbose         # also prints the same payload as `info`
opcua-server healthcheck --timeout 2000    # bound the whole check tighter (default: 2000ms)
opcua-server healthcheck --port 4880
```

The check itself is bounded by `--timeout` (`connect` and the `info` request each get their own budget, applied sequentially) so it can't hang a container's health check even against a completely unresponsive server.

### Inspecting tag values: `watch` and `get`

`watch` and `get` share one selector for picking which tag(s) to look at — exactly one of `--device`, `--node-id`, or `--browse-name`:

| Flag | Selects |
| --- | --- |
| `--device <key>` | Every tag on that device (or a `--tags` subset — `get` only). |
| `--node-id <id>` | The single tag with that exact NodeId. Can't combine with `--device`/`--browse-name`/`--tags`. |
| `--browse-name <name>` | The tag(s) with that browse name. If more than one device has a tag with that name, add `--device` to disambiguate — that's the *only* combination `--browse-name` accepts. |
| `--tags <a,b,c>` (`get` only) | A comma-separated browse-name subset, scoped to `--device` (requires it). |

An invalid combination (e.g. `--node-id` with `--device`, or `--tags` without `--device`) is rejected immediately with `ExitCode.VALIDATION_ERROR` — no connection attempted. An ambiguous `--browse-name` with no `--device` is rejected too, listing every match instead of guessing:

```
$ opcua-server get --browse-name Temperature
TAG_BROWSE_NAME_AMBIGUOUS

Multiple tags named "Temperature" found — specify --device to disambiguate:
  PLC1.Temperature (ns=1;s=PLC1.Temperature)
  PLC2.Temperature (ns=1;s=PLC2.Temperature)
```

**`get`** — reads the **current** value of one or more tags once and exits. Backed by the same `tags.get` control-channel request `watch` resolves against, but reads the live value directly rather than waiting for a change — so it returns instantly even for a tag that never changes:

```bash
opcua-server get --device plc1
opcua-server get --node-id "ns=2;s=PLC1.Temperature1"
opcua-server get --browse-name Temperature1
opcua-server get --device plc1 --tags Temperature1,Temperature2
```

```
plc1.Temperature1        72.6
plc1.Temperature2        68.1
plc1.HomeSwitchStatus    true
```

**`watch`** — streams real-time tag value changes until you stop it with `Ctrl+C`:

```bash
opcua-server watch --device plc1
opcua-server watch --node-id "ns=2;s=PLC1.Temperature1"
opcua-server watch --browse-name Temperature1
```

```
[12:04:31.201] plc1.Temperature1        72.4 → 72.6
[12:04:31.980] plc1.HomeSwitchStatus    false → true
```

It opens a real subscription over the control channel (not a one-shot request) and, by default, only prints changes that pass the same `hasSignificantChange` deadband the server's own `debug`-level tag-change logs use (see `start`'s `--log-level` above) — one deadband check, shared by both, so `watch`'s output can never disagree with what the server itself considers "a change". Pass `--log-level trace` to see every update instead, matching `start --log-level trace`'s behavior:

```bash
opcua-server watch --device plc1 --log-level trace
```

`Ctrl+C` disconnects cleanly — the control channel's own socket-close handling (see [`src/control/control-server.ts`](src/control/control-server.ts)) tears down the subscription server-side, so no stray subscription is left running after `watch` exits.

## Running with Docker

Build the image (multi-stage: installs full deps to run `tsc`, then a separate production-only `npm ci --omit=dev` layer for the final image):

```bash
docker build -t opcua-server .
```

Run it, publishing the OPC UA port to the host:

```bash
docker run --rm -p 4840:48040 opcua-server
```

The image ships with sensible container defaults baked in via `ENV` (overridable with `-e`): `NODE_ENV=production`, `PORT=48040`, `HOSTNAME=0.0.0.0`, `LOG_LEVEL=info`. **`HOSTNAME=0.0.0.0` matters** — the app's own default (`127.0.0.1`) would bind only inside the container's network namespace and be unreachable from the host or other containers.

### Overriding device configuration without rebuilding

The image bakes in the project's own `devices.json` as a default. To use your own instead, mount a directory containing a `devices.json` at `/app/devices`:

```bash
docker run --rm -p 4840:48040 -v ./my-devices:/app/devices opcua-server
```

`findDevicesDirectory()` checks `/app/devices` before falling back to the image's built-in default, so the mounted file wins — no rebuild needed. Hot-reload (see above) works the same way inside the container: edit the mounted file and the running server picks it up.

### Health check

The image defines a `HEALTHCHECK` that runs `opcua-server healthcheck` (#39) — it talks to the running server over the same control channel `info` uses, so "healthy" reflects real server status (`MetricsService`), not just "the port accepts a TCP connection". Check status with:

```bash
docker inspect --format='{{.State.Health.Status}}' <container>
```

Stopping the container (`docker stop`) sends `SIGTERM` to the Node process directly (the `Dockerfile`'s `CMD` uses exec form so Node is PID 1), triggering the same graceful-shutdown path as running locally.

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

Real-time tag value change notifications are intentionally **not** part of this service — `MetricsService` stays pull-based. That push/event concern belongs to `TagRuntime` ([`src/tags/tag-runtime.ts`](src/tags/tag-runtime.ts)) instead, which is what backs `watch`/`get` (see above).

## Project structure

```
src/
├── index.ts                     # npm start entry point: thin wrapper around server-runner.ts
├── server-runner.ts             # startServer(): manager + graceful shutdown wiring (shared with the CLI)
├── cli/                         # commander.js CLI (see "CLI" above)
│   ├── bin.ts                   # `opcua-server` binary entry point
│   ├── program.ts               # Builds the root Command; exitOverride -> ExitCode mapping
│   ├── log-levels.ts            # Shared --log-level validation
│   ├── target-port.ts           # Shared --port resolution/validation (start, reload, info, ...)
│   ├── format-uptime.ts         # uptimeMs -> "4h 12m" (CLI-layer formatting, per #34)
│   ├── format-value.ts          # Tag value -> display string, shared by watch/get
│   ├── tag-selector.ts          # --device/--node-id/--browse-name/--tags validation, shared by watch/get
│   ├── control-error.ts         # Shared control-channel failure reporting -> ExitCode
│   └── commands/
│       ├── start.ts             # opcua-server start
│       ├── validate.ts          # opcua-server validate <file>
│       ├── reload.ts            # opcua-server reload
│       ├── info.ts              # opcua-server info
│       ├── healthcheck.ts       # opcua-server healthcheck
│       ├── watch.ts             # opcua-server watch
│       └── get.ts               # opcua-server get
├── config/
│   └── server-config.ts         # Reads env vars into OPCUAServer options
├── core/
│   └── opcua-server-manager.ts  # Lifecycle: initialize -> build address space -> start -> shutdown
├── devices/
│   ├── devices.json              # Device/tag definitions (see above)
│   ├── config-reader.ts          # Reads + validates devices.json
│   ├── config-watcher.ts         # Watches devices.json and triggers hot reload
│   ├── device-factory.ts         # Creates an OPC UA object node for a device
│   ├── device-manager.ts         # Registers/removes/reloads devices in the address space
│   └── resolve-tags.ts           # watch/get selector resolution against the device list (#40)
├── tags/
│   ├── factory.ts                # Dispatches tag creation by type
│   ├── primitive.ts              # Creates a variable node with change-logging
│   └── tag-runtime.ts            # Live tag registry + change-event stream behind watch/get (#40)
├── schemas/                      # zod schemas for devices/tags
├── errors/                       # AppError hierarchy, ErrorCode, ExitCode, logAppError
├── metrics/                      # MetricsService, ServerStatus/DeviceStatus types
├── control/                      # CLI <-> running-server channel: ControlServer, ControlClient (see above)
├── types/                        # Shared TypeScript types
├── utils/
│   ├── comparison.ts             # Numeric change-detection helper
│   └── package-info.ts           # getPackageVersion() (used by --version and runtime metrics)
└── infrastructure/
    └── logger/                   # pino logger setup (console + logs/errors.log)

docs/decisions/                   # Architecture decision records (e.g. the control channel transport choice)

Dockerfile                        # Multi-stage build (see "Running with Docker" above)
.dockerignore
```

## Testing

Tests run with [Vitest](https://vitest.dev/).

```bash
npm test              # run all tests once
npm run test:watch    # watch mode
npm run test:coverage # run with coverage report
```

- `tests/**/*.test.ts` — unit tests for schemas, tag factories, `DeviceManager`, `ConfigWatcher`, config reading, the `AppError`/`ExitCode` error system, `MetricsService`, and the CLI (option parsing, env-var override priority, `validate` output/exit codes), with `node-opcua` and the filesystem mocked.
- `tests/core/opcua-server-manager.integration.test.ts` — integration tests that boot a real OPC UA server on an OS-assigned port (no mocks), load the real `devices.json`, connect with a real OPC UA client, and verify address-space creation, device loading, tag reads, and graceful shutdown end-to-end.

## Linting & formatting

```bash
npm run lint         # ESLint
npm run lint:fix      # ESLint with autofix
npm run format:check  # Prettier check
npm run format        # Prettier write
```
