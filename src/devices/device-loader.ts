import fs from 'node:fs';
import path from 'node:path';

import { DevicesSchema } from '../schemas/index.ts';
import type {
  AddressSpaceLike,
  NamespaceLike,
  DeviceConfig,
} from '../types/index.ts';

import { createDevice } from './device-factory.js';

const candidates = [
  path.join(process.cwd(), 'src', 'devices'),
  path.join(process.cwd(), 'dist', 'devices'),
];

function findDevicesDirectory(): string | null {
  for (const c of candidates) {
    try {
      if (fs.statSync(c).isDirectory()) return c;
    } catch {
      console.warn(`Devices directory not found: ${c}`);
    }
  }

  return null;
}

export function loadDevices(
  addressSpace: AddressSpaceLike,
  namespace: NamespaceLike,
): void {
  void addressSpace;

  const devicesPath = findDevicesDirectory();

  if (!devicesPath) {
    console.warn(`No devices directory found. Expected one of: ${candidates.join(', ')}`);
    return;
  }

  const devicesFile = path.join(devicesPath, 'devices.json');

  let raw: string;
  try {
    raw = fs.readFileSync(devicesFile, 'utf8');
  } catch (error) {
    console.error(`Unable to read device file: ${path.basename(devicesFile)}`);
    console.error(error);
    return;
  }

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (error) {
    console.error(`Invalid JSON in device file: ${path.basename(devicesFile)}`);
    console.error(error);
    return;
  }

  const parsed = DevicesSchema.safeParse(json);

  if (!parsed.success) {
    console.error(`Invalid device configuration in file: ${path.basename(devicesFile)}`);
    console.error(parsed.error.issues);
    return;
  }

  const devices: Record<string, DeviceConfig> = parsed.data;

  for (const [deviceKey, config] of Object.entries(devices)) {
    console.log(`Loading device: ${deviceKey} (${config.name})`);
    createDevice(namespace, config);
  }
}
