import { readDevicesConfig } from './config-reader.ts';
import { createDevice } from './device-factory.ts';
import { createModuleLogger } from '../infrastructure/logger/index.ts';
import type { AddressSpaceLike, NamespaceLike } from '../types/index.ts';

const logger = createModuleLogger('address-space');

export function loadDevices(
  addressSpace: AddressSpaceLike,
  namespace: NamespaceLike,
): void {
  void addressSpace;

  const devices = readDevicesConfig();
  if (!devices) return;

  for (const [deviceKey, config] of Object.entries(devices)) {
    logger.info({ deviceKey, deviceName: config.name }, 'Loading device');
    createDevice(namespace, config);
  }
}