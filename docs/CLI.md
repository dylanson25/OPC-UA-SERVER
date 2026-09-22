# CLI Reference

A [commander.js](https://github.com/tj/commander.js)-based `opcua-server` binary ([`src/cli/`](../src/cli/), entry point [`src/cli/bin.ts`](../src/cli/bin.ts)) is installed alongside the package (`"bin"` in `package.json`) and provides `start`/`validate`/`reload`/`info`/`healthcheck`/`watch`/`get`/`cert`/`export-nodeset`.

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
| `--certificate-file <path>` | `CERTIFICATE_FILE` — see the main README's ["Server certificate"](../README.md#server-certificate) section. |
| `--private-key-file <path>` | `PRIVATE_KEY_FILE` |
| `--nodeset-file <path>` (repeatable) | `NODESET_FILES` — extra NodeSet2 XML file(s) to import into the address space alongside the standard UA nodeset, e.g. a file produced by `export-nodeset` or UaModeler. |

Overrides are applied **in memory only** for that run — nothing is written back to `.env` or any config file. Priority is CLI flag > environment variable > default; a flag left unset falls through to whatever `.env`/the environment already has.

`--log-level trace` makes every tag value update get logged (not just ones that pass the significant-change deadband) — useful for checking whether the deadband itself is filtering out an update you expected to see. At `debug` and above, only deadband-passing changes are logged (existing behavior).

**`validate`** — checks a device configuration file without starting the server:

```bash
opcua-server validate devices.json
```

```
✓ devices.json is valid — 2 device(s), 7 tag(s).
```

On failure, it prints the structured error code and message (from the `AppError` hierarchy — see the main README's ["Error handling & exit codes"](../README.md#error-handling--exit-codes)) and exits with the matching `ExitCode`:

```
$ opcua-server validate ./broken.json
DEVICE_CONFIG_INVALID

Path:
PLC1.tags.1.nodeId

Reason:
Duplicate nodeId: 'ns=1;s=Dup'.
```

**`cert`** — shows (or exports) this server's own OPC UA certificate, standalone like `start`/`validate` (no running server needed) — see the main README's ["Server certificate"](../README.md#server-certificate) section for the full picture:

```bash
opcua-server cert
opcua-server cert --out ./server-cert.pem
```

## Talking to an already-running server

`start`/`validate` above are standalone — but `reload`, `info`, `healthcheck`, `watch`, `get`, and `export-nodeset` reach into a server that's *already running*, from a separate CLI invocation. They all go through one dedicated local control channel ([`src/control/`](../src/control/)) rather than each inventing their own. It runs alongside the OPC UA endpoint automatically — nothing to configure. Design decision and rationale: [`docs/decisions/0001-cli-server-control-channel.md`](decisions/0001-cli-server-control-channel.md).

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

**`info`** — displays current server status and statistics, backed by [`MetricsService`](../src/metrics/metrics-service.ts) (#34):

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

It reuses the exact same control-channel `info` request as the `info` command above — no separate health signal to keep in sync. `status: 'running'` is the only healthy state; `starting`, `degraded`, `stopping`, and `stopped` all count as unhealthy (same line the `MetricsService`-derived `degraded` status draws — see the main README's ["Runtime metrics"](../README.md#runtime-metrics) section):

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

## Inspecting tag values: `watch` and `get`

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

`Ctrl+C` disconnects cleanly — the control channel's own socket-close handling (see [`src/control/control-server.ts`](../src/control/control-server.ts)) tears down the subscription server-side, so no stray subscription is left running after `watch` exits.

**`export-nodeset`** — exports the running server's address space as standard **NodeSet2 XML** (the same format tools like UaModeler/UaExpert import/export), backed by node-opcua's own `namespace.toNodeset2XML()`:

```bash
opcua-server export-nodeset > nodeset2.xml
opcua-server export-nodeset --out ./nodeset2.xml
```

Prints the raw XML to stdout by default (safe to pipe/redirect — no extra status text mixed in); `--out <path>` writes it straight to a file instead (creating the destination directory if needed) and prints a short confirmation to stderr.

**Importing a NodeSet2 XML file** — the reverse direction, at server startup: pass it to `start --nodeset-file` (repeatable, or `NODESET_FILES`, comma-separated), and node-opcua loads it into the address space alongside the standard UA nodeset when the server initializes:

```bash
opcua-server start --nodeset-file ./nodeset.xml
opcua-server start --nodeset-file ./nodeset.xml --nodeset-file ./other.xml
```

A file that doesn't exist is logged as a `NODESET_FILE_NOT_FOUND` `ConfigurationError` and skipped rather than aborting startup — check the logs if an imported node doesn't show up. The file must be self-contained (or its `<RequiredModel>`/`<Uri>` dependencies covered by another `--nodeset-file`) — `--nodeset-file` doesn't currently resolve external model dependencies the way `nodesetCatalog`'s built-in `dependencies` do.
