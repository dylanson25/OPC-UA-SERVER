import { z } from 'zod';
import { TagSchema } from './tag.schema.ts';
import { validateUnique } from './utils.ts';

export const DeviceSchema = z
    .object({
        name: z.string().trim().min(1),
        nodeId: z.string().trim().min(1),
        tags: z.array(TagSchema).min(1),
    })
    .strict()
    .superRefine((device, ctx) => {
        validateUnique(device.tags, (tag) => tag.nodeId, 'nodeId', ctx, ['tags']);
        validateUnique(device.tags, (tag) => tag.browseName, 'browseName', ctx, ['tags']);
    });

export const DevicesSchema = z
    .record(z.string(), DeviceSchema)
    .superRefine((devices, ctx) => {
        const deviceEntries = Object.entries(devices);

        validateUnique(
            deviceEntries,
            ([_deviceKey, device]) => device.name,
            'name',
            ctx,
            [],
            ([deviceKey]) => [deviceKey],
        );

        validateUnique(
            deviceEntries,
            ([_deviceKey, device]) => device.nodeId,
            'nodeId',
            ctx,
            [],
            ([deviceKey]) => [deviceKey],
        );
    });

export type DeviceSchemaType = z.infer<typeof DeviceSchema>;
export type DevicesSchemaType = z.infer<typeof DevicesSchema>;