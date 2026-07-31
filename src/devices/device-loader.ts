import fs from 'node:fs';
import path from 'node:path';

import { DevicesSchema } from '../schemas/index.ts';
import type {
  AddressSpaceLike,
  NamespaceLike,
  DeviceConfig,
} from '../types/index.ts';
import { createModuleLogger } from '../infrastructure/logger/index.ts';

import { createDevice } from './device-factory.ts';

const logger = createModuleLogger('address-space');

const candidates = [
  path.join(process.cwd(), 'src', 'devices'),
  path.join(process.cwd(), 'dist', 'devices'),
];

function findDevicesDirectory(): string | null {
  for (const c of candidates) {
    try {
      if (fs.statSync(c).isDirectory()) return c;
    } catch {
      logger.warn({ path: c }, 'Devices directory not found');
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
    logger.warn(
      { candidates },
      'No devices directory found',
    );
    return;
  }

  const devicesFile = path.join(devicesPath, 'devices.json');

  let raw: string;
  try {
    raw = fs.readFileSync(devicesFile, 'utf8');
  } catch (error) {
    logger.error(
      { file: path.basename(devicesFile), err: error },
      'Unable to read device file',
    );
    return;
  }

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (error) {
    logger.error(
      { file: path.basename(devicesFile), err: error },
      'Invalid JSON in device file',
    );
    return;
  }

  const parsed = DevicesSchema.safeParse(json);

  if (!parsed.success) {
    logger.error(
      { file: path.basename(devicesFile), issues: parsed.error.issues },
      'Invalid device configuration in file',
    );
    return;
  }

  const devices: Record<string, DeviceConfig> = parsed.data;

  for (const [deviceKey, config] of Object.entries(devices)) {
    logger.info({ deviceKey, deviceName: config.name }, 'Loading device');
    createDevice(namespace, config);
  }
}
