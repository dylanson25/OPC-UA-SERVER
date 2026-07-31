import { z } from 'zod';
import type { TagConfig } from '../types/index.ts';

const baseTagSchema = z.object({
    browseName: z.string().trim().min(1),
    nodeId: z.string().trim().min(1),
});

export const TagSchema: z.ZodType<TagConfig> = z.union([
    baseTagSchema.extend({
        type: z.literal('boolean'),
        initialValue: z.boolean().optional(),
    }),
    baseTagSchema.extend({
        type: z.literal('integer'),
        initialValue: z.number().int().optional(),
    }),
    baseTagSchema.extend({
        type: z.literal('float'),
        initialValue: z.number().optional(),
    }),
    baseTagSchema.extend({
        type: z.literal('double'),
        initialValue: z.number().optional(),
    }),
    baseTagSchema.extend({
        type: z.literal('string'),
        initialValue: z.string().optional(),
    }),
    baseTagSchema.extend({
        type: z.literal('dateTime'),
        initialValue: z.union([z.string(), z.number(), z.date()]).optional(),
    }),
]);


