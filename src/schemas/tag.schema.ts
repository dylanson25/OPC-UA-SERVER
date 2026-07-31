import { z } from 'zod';
import type { TagConfig } from '../types/index.ts';

export const TagSchema: z.ZodType<TagConfig> = z.object({
    type: z.enum(['boolean']),
    browseName: z.string().min(1),
    nodeId: z.string().min(1),
    initialValue: z.boolean().optional(),
});


