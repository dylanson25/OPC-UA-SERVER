import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

import { DeviceSchema } from '../schemas/index.ts';
import type {
  AddressSpaceLike,
  NamespaceLike,
  DeviceConfig,
} from '../types/index.ts';

import { createDevice } from './device-factory.js';

function findDevicesDirectory(): string | null {
  const candidates = [
    path.join(process.cwd(), 'src', 'devices'),
    path.join(process.cwd(), 'dist', 'devices'),
  ];

  for (const c of candidates) {
    try {
      if (fs.statSync(c).isDirectory()) return c;
    } catch (e) {
      console.warn(`Devices directory not found: ${c}`);
      console.warn(e);
    }
  }

  return null;
}

export function loadDevices(
  addressSpace: AddressSpaceLike,
  namespace: NamespaceLike,
): void {
  const devicesPath = findDevicesDirectory();

  if (!devicesPath) {
    console.warn('No devices directory found. Expected one of: ./devices, ./src/devices, ./dist/devices',);
    return;
  }

  const files = fs.readdirSync(devicesPath);

  const jsonFiles = files.filter((file) => file.endsWith('.json'));

  const seenDevices = new Set<string>();

  for (const file of jsonFiles) {
    const fullPath = path.join(devicesPath, file);
    const raw = fs.readFileSync(fullPath, 'utf8');
    const json = JSON.parse(raw);
    let zodParseResult = DeviceSchema.safeParse(json)
    let config: DeviceConfig;

    if (!zodParseResult.success) {
      console.error(`Invalid device configuration in file: ${file}`);
      console.error(zodParseResult.error.format());
      continue;
    }

    config = zodParseResult.data;

    if (seenDevices.has(config.name)) {
      console.warn(`Skipping duplicate device definition: ${config.name}`);
      continue;
    }

    // dedupe tags inside device by nodeId
    const seenTagIds = new Set<string>();
    config.tags = (config.tags).filter((t) => {
      if (!t.nodeId) return false;
      if (seenTagIds.has(t.nodeId)) return false;
      seenTagIds.add(t.nodeId);
      return true;
    });

    console.log(`Loading device: ${config.name}`);

    createDevice(namespace, config);
    seenDevices.add(config.name);
  }
}
