import type { NamespaceLike, DeviceConfig } from '../types/index.ts';
import { createTag } from '../tags/factory.js';

export function createDevice(namespace: NamespaceLike, config: DeviceConfig) {
  const device = namespace.addObject({
    browseName: config.name,
    organizedBy: 'ObjectsFolder',
  });

  for (const tag of config.tags) {
    createTag({
      namespace,
      device,
      config: tag,
    });
  }

  return device;
}
