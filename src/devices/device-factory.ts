import type { NamespaceLike, DeviceConfig } from '../types/index.ts';
import type { MetricsService } from '../metrics/index.ts';
import { createTag } from '../tags/factory.ts';

export function createDevice(namespace: NamespaceLike, config: DeviceConfig, metrics?: MetricsService) {
  const device = namespace.addObject({
    browseName: config.name,
    organizedBy: 'ObjectsFolder',
  });

  for (const tag of config.tags) {
    createTag({
      namespace,
      device,
      config: tag,
      metrics,
    });
  }

  return device;
}
