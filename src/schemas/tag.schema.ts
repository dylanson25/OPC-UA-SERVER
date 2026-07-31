import { z } from 'zod';
import type { TagConfig } from '../types/index.ts';

const TagsEnum = z.enum(['boolean']);

export const TagSchema: z.ZodType<TagConfig> = z.object({
    type: TagsEnum,
    browseName: z.string().trim().min(1),
    nodeId: z.string().trim().min(1),
    initialValue: z.boolean().optional(),
});


