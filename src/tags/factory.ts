import { addBooleanTag } from './boolean.ts';
import { createModuleLogger } from '../infrastructure/logger/index.js';
import type { CreateTagParams } from '../types/index.ts';

const logger = createModuleLogger('address-space');

export function createTag({ namespace, device, config }: CreateTagParams) {
  switch (config.type) {
    case 'boolean':
      return addBooleanTag({
        namespace,
        device,
        ...config,
      });
    default:
      logger.warn({ tagType: config.type }, 'Unsupported tag type');
  }
}
