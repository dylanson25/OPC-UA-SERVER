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
├── types/                        # Shared TypeScript types
├── utils/
│   └── comparison.ts             # Numeric change-detection helper
└── infrastructure/
    └── logger/                   # pino logger setup
```

## Testing

Tests run with [Vitest](https://vitest.dev/).

```bash
npm test              # run all tests once
npm run test:watch    # watch mode
npm run test:coverage # run with coverage report
```

- `tests/**/*.test.ts` — unit tests for schemas, tag factories, `DeviceManager`, `ConfigWatcher`, and config reading, with `node-opcua` and the filesystem mocked.
- `tests/core/opcua-server-manager.integration.test.ts` — integration tests that boot a real OPC UA server on an OS-assigned port (no mocks), load the real `devices.json`, connect with a real OPC UA client, and verify address-space creation, device loading, tag reads, and graceful shutdown end-to-end.

## Linting & formatting

```bash
npm run lint         # ESLint
npm run lint:fix      # ESLint with autofix
npm run format:check  # Prettier check
npm run format        # Prettier write
```
