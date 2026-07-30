# OPC UA Lab Server

A lightweight OPC UA server (built with [node-opcua](https://www.npmjs.com/package/node-opcua)) that simulates two PLC devices — the Former (AF) and the Trim Press (TP) — each exposing Boolean tags for testing/integration with an OPC UA client.

## Requirements

- [Node.js](https://nodejs.org/) v18 or newer
- npm (comes with Node.js)

## Setup

1. Unzip/copy the project folder.
2. Open a terminal in the project folder and install dependencies:

   ```bash
   npm install
   ```

## Running the server

```bash
node index.js
```

If it starts correctly you'll see something like:

```
Server listening (Ctrl+C to stop)
port: 4080
endpoint: opc.tcp://<hostname>:4080/UA/
```

Stop the server with `Ctrl+C`.

## Parameters you will likely need to adjust

All server settings live in **`server-config.js`**.

| Parameter             | Current value      | What to change it to                                                                                                                                                                        |
| --------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `hostname`            | `192.168.0.150`    | The IP address (or hostname) of **your** machine's network interface. Run `ipconfig` (Windows) or `ifconfig`/`ip addr` (Mac/Linux) to find it. Use `"0.0.0.0"` to listen on all interfaces. |
| `port`                | `4080`             | Change only if `4080` is already in use on your machine, or if your network/firewall requires a different port.                                                                             |
| `resourcePath`        | `/UA/`             | Optional — only matters if a client expects a specific endpoint path.                                                                                                                       |
| `buildInfo.buildDate` | fixed date in code | Cosmetic only, safe to leave as is.                                                                                                                                                         |

After changing `hostname` or `port`, the full endpoint URL a client should connect to is:

```
opc.tcp://<hostname>:<port><resourcePath>
```

e.g. `opc.tcp://192.168.1.20:4080/UA/`

## Simulated tags

| Device                  | Node ID       | Browse Name                      |
| ----------------------- | ------------- | -------------------------------- |
| PLC-IRWIN-FORMER-DEVICE | `s=PRS_20_AF` | Top_Platen_Home_Switch_PRS-20    |
| PLC-IRWIN-FORMER-DEVICE | `s=PRS_21_AF` | Bottom_Platen_Home_Switch_PRS-21 |
| PLC-TP-LAB-DEVICE       | `s=PE_20_TP`  | Servo_Pick_Register_PE-20        |
| PLC-TP-LAB-DEVICE       | `s=PE_22_TP`  | TP_Platen_Home_Switch_PRS-22     |

All tags are Boolean, default to `true`, and log a line to the console whenever their value changes. To add or rename a tag, edit the `TAGS` array at the top of the corresponding file in `devices/`.

## Project structure

```
.
├── index.js              # Entry point: starts the server, wires up devices
├── server-config.js       # Server connection settings (hostname, port, etc.)
├── package.json
└── devices/
    ├── index.js           # Exports all device setup functions
    ├── boolean-tag.js      # Shared helper for adding logged Boolean tags
    ├── plc-af-lab.dev.js   # Former (AF) PLC tag definitions
    └── plc-tp-lab.dev.js   # Trim Press (TP) PLC tag definitions
```
