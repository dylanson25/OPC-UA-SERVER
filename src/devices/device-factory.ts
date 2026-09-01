import type { NamespaceLike, DeviceConfig } from '../types/index.ts';
import type { MetricsService } from '../metrics/index.ts';
import type { TagRuntime } from '../tags/tag-runtime.ts';
import { createTag } from '../tags/factory.ts';

export function createDevice(
  namespace: NamespaceLike,
  config: DeviceConfig,
  metrics?: MetricsService,
  tagRuntime?: TagRuntime,
  deviceKey?: string,
) {
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
      tagRuntime,
      deviceKey,
    });
  }

  return device;
}
