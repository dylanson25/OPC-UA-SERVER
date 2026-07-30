import { addBooleanTag } from './boolean.ts';
import type { CreateTagParams } from '../types/index.ts';

export function createTag({ namespace, device, config }: CreateTagParams) {
  switch (config.type) {
    case 'boolean':
      return addBooleanTag({
        namespace,
        device,
        ...config,
      });
    default:
      console.warn(`Unsupported tag type: ${config.type}`);
  }
}
