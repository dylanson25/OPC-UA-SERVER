import { z } from 'zod';
import { TagSchema } from './tag.schema.js';
import type { DeviceConfig } from '../types/index.ts';

export const DeviceSchema: z.ZodType<DeviceConfig> = z.object({
    name: z.string().min(1),
    nodeId: z.string().min(1),
    tags: z.array(TagSchema).min(1),
});
